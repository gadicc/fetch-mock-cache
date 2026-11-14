import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function hasDocumentation(doc) {
  return typeof doc === "string" && doc.trim().length > 0;
}

/** Verify the pinned Deno 2.9 documentation JSON without accepting unknown shapes. */
export function validateDocJson(document, entrypointUrl) {
  assert.equal(document?.version, 2, "Unsupported Deno doc JSON version");
  assert.ok(
    document.nodes && typeof document.nodes === "object",
    "Deno doc JSON must contain a nodes map",
  );
  const module = document.nodes[entrypointUrl];
  assert.ok(module, `Missing documentation module: ${entrypointUrl}`);
  assert.ok(
    hasDocumentation(module.module_doc?.doc) &&
      module.module_doc?.tags?.some((tag) => tag.kind === "module"),
    `Missing @module documentation: ${entrypointUrl}`,
  );
  assert.ok(Array.isArray(module.symbols), "Missing Deno doc symbols array");
  for (const symbol of module.symbols) {
    assert.ok(typeof symbol.name === "string", "Unnamed documentation symbol");
    assert.ok(
      Array.isArray(symbol.declarations) && symbol.declarations.length > 0,
      `Missing declarations: ${symbol.name}`,
    );
    for (const declaration of symbol.declarations) {
      if (declaration.kind === "import") continue;
      assert.notEqual(
        declaration.declarationKind,
        "private",
        `Private type exposed by ${symbol.name}`,
      );
      assert.equal(
        declaration.declarationKind,
        "export",
        `Unexpected declaration kind for ${symbol.name}`,
      );
      assert.ok(
        hasDocumentation(declaration.jsDoc?.doc),
        `Missing documentation for ${symbol.name}`,
      );
    }
  }
}

/** JSR scores named re-export specifiers independently of the original symbol. */
export function validateReexportDocs(source, filename = "entrypoint.ts") {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.equal(
    file.parseDiagnostics.length,
    0,
    `Invalid TypeScript: ${filename}`,
  );
  const importedNames = new Set();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const { name, namedBindings } = statement.importClause;
    if (name) importedNames.add(name.text);
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      importedNames.add(namedBindings.name.text);
    } else if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const specifier of namedBindings.elements) {
        importedNames.add(specifier.name.text);
      }
    }
  }
  const hasDirectDocumentation = (node) =>
    ts
      .getJSDocCommentsAndTags(node)
      .some((comment) =>
        hasDocumentation(ts.getTextOfJSDocComment(comment.comment)),
      );
  for (const statement of file.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) {
      continue;
    }
    if (ts.isNamespaceExport(statement.exportClause)) {
      // Namespace exports have no named specifier to attach JSDoc to; the
      // declaration's leading JSDoc documents the exported namespace.
      assert.ok(
        hasDirectDocumentation(statement),
        `Missing namespace re-export documentation for ${statement.exportClause.name.text} in ${filename}`,
      );
      continue;
    }
    for (const specifier of statement.exportClause.elements) {
      const localName = (specifier.propertyName ?? specifier.name).text;
      if (!statement.moduleSpecifier && !importedNames.has(localName)) continue;
      assert.ok(
        hasDirectDocumentation(specifier),
        `Missing direct re-export documentation for ${specifier.name.text} in ${filename}`,
      );
    }
  }
}

/** Keep npm aliases and source export targets synchronized with JSR. */
export function validateExportParity(npmExports, jsrExports) {
  assert.deepEqual(
    Object.keys(npmExports).sort(),
    Object.keys(jsrExports).sort(),
    "npm and JSR export keys differ",
  );
  for (const [name, target] of Object.entries(npmExports)) {
    assert.equal(typeof target, "string", `Unsupported npm export: ${name}`);
    assert.match(target, /^\.\/lib\/.+\.js$/, `Invalid npm export: ${name}`);
    assert.equal(
      jsrExports[name],
      target.replace(/^\.\/lib\//, "./src/").replace(/\.js$/, ".ts"),
      `npm and JSR export targets differ for ${name}`,
    );
  }
}

async function runDeno(args, cwd) {
  try {
    return await execute("deno", args, {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 120_000,
    });
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

async function configurationSnapshot(cwd) {
  const files = ["deno.lock", "deno.json", "deno.jsonc", "jsr.json"];
  return Promise.all(
    files.map(async (file) => {
      try {
        return await readFile(join(cwd, file), "utf8");
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    }),
  );
}

/** Run documentation checks and a non-publishing JSR package validation. */
export async function checkJsr(cwd = root) {
  const npm = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
  const jsr = JSON.parse(await readFile(join(cwd, "jsr.json"), "utf8"));
  validateExportParity(npm.exports, jsr.exports);
  const before = await execute(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd },
  );
  const configurationBefore = await configurationSnapshot(cwd);
  const temporary = await mkdtemp(join(tmpdir(), "fmc-jsr-"));
  let validationError;
  try {
    const importMap = join(temporary, "imports.json");
    await writeFile(importMap, JSON.stringify({ imports: jsr.imports ?? {} }));
    const entrypoints = [...new Set(Object.values(jsr.exports))];
    const absoluteEntrypoints = [];
    for (const entrypoint of entrypoints) {
      assert.equal(
        typeof entrypoint,
        "string",
        "Unsupported JSR export target",
      );
      const absolute = resolve(cwd, entrypoint);
      validateReexportDocs(await readFile(absolute, "utf8"), entrypoint);
      absoluteEntrypoints.push(absolute);
    }
    const common = [
      "--quiet",
      "--no-config",
      "--no-lock",
      "--unstable-sloppy-imports",
      "--import-map",
      importMap,
    ];
    // Deno must see the complete public surface: shared types exported from
    // another entrypoint otherwise appear private when one module is linted.
    await runDeno(["doc", "--lint", ...common, ...absoluteEntrypoints], cwd);
    const { stdout } = await runDeno(
      ["doc", "--json", ...common, ...absoluteEntrypoints],
      cwd,
    );
    const document = JSON.parse(stdout);
    for (const [index, entrypoint] of entrypoints.entries()) {
      validateDocJson(document, pathToFileURL(absoluteEntrypoints[index]).href);
      console.log(`JSR documentation checked: ${entrypoint}`);
    }
    const result = await runDeno(
      [
        "publish",
        "--dry-run",
        "--config",
        "jsr.json",
        "--allow-dirty",
        "--no-lock",
        "--unstable-sloppy-imports",
      ],
      cwd,
    );
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    console.log(`JSR validation passed for ${entrypoints.length} entrypoints.`);
  } catch (error) {
    validationError = error;
    throw error;
  } finally {
    try {
      await rm(temporary, { recursive: true, force: true });
      const after = await execute(
        "git",
        ["status", "--porcelain", "--untracked-files=all"],
        { cwd },
      );
      assert.equal(
        after.stdout,
        before.stdout,
        "JSR validation changed tracked or untracked repository files",
      );
      assert.deepEqual(
        await configurationSnapshot(cwd),
        configurationBefore,
        "JSR validation changed Deno configuration or lockfile contents",
      );
    } catch (error) {
      if (!validationError) throw error;
      // Preserve the actionable validation error while reporting any cleanup
      // or repository mutation failure as an additional diagnostic.
      console.error(`JSR cleanup/mutation check also failed: ${error.message}`);
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  checkJsr().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
