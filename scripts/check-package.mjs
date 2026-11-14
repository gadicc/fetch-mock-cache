import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));

/** Validate the actual packed files and their complete relative import graph. */
export function validatePackage(files, manifest) {
  const names = new Set(files.keys());
  for (const name of names) {
    assert(
      !name.startsWith("/") && !name.split("/").includes(".."),
      `Unsafe packed path: ${name}`,
    );
    assert(
      !/(?:^|\/)(?:testUtils|temp_regenerate)(?:\.|\/)|\.(?:spec|test)\.(?:js|d\.ts)$/.test(
        name,
      ),
      `Test/helper artifact shipped: ${name}`,
    );
  }
  for (const name of [
    "package.json",
    "README.md",
    "LICENSE.txt",
    "MIGRATING.md",
  ]) {
    assert(names.has(name), `Missing packaged documentation: ${name}`);
  }
  assert(
    manifest.exports && Object.keys(manifest.exports).length > 0,
    "No package exports to validate",
  );
  const pending = [];
  for (const [key, target] of Object.entries(manifest.exports)) {
    assert(
      typeof target === "string" &&
        target.startsWith("./") &&
        target.endsWith(".js"),
      `Unsupported export target for ${key}`,
    );
    const file = target.slice(2);
    const declaration = file.replace(/\.js$/, ".d.ts");
    assert(names.has(file), `Missing export target for ${key}: ${file}`);
    assert(
      names.has(declaration),
      `Missing declaration for ${key}: ${declaration}`,
    );
    pending.push(file, declaration);
  }
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = files.get(file);
    assert(typeof source === "string", `Missing packed source: ${file}`);
    const imports = ts.preProcessFile(source, true, true).importedFiles;
    for (const { fileName } of imports) {
      if (!fileName.startsWith(".")) continue;
      let dependency = posix.normalize(
        posix.join(posix.dirname(file), fileName),
      );
      if (file.endsWith(".d.ts") && !dependency.endsWith(".d.ts")) {
        dependency = dependency.replace(/\.(?:js|ts)$/, ".d.ts");
      }
      assert(
        names.has(dependency),
        `Missing relative dependency: ${file} -> ${dependency}`,
      );
      pending.push(dependency);
    }
  }
  return visited;
}

async function readTree(directory, prefix = "") {
  const files = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = posix.join(prefix, entry.name);
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Symlink in packed package: ${name}`);
    if (entry.isDirectory()) {
      for (const item of await readTree(path, name)) files.set(...item);
    } else {
      files.set(name, await readFile(path, "utf8"));
    }
  }
  return files;
}

/** Create an isolated consumer directory with a canonical parent path. */
export async function createPackageTempDirectory(directory = tmpdir()) {
  // macOS exposes /var through /private/var; normalize the temporary root
  // before comparing installed paths with realpath results.
  return realpath(await mkdtemp(join(directory, "fetch-mock-cache-package-")));
}

/** Pack and install outside the checkout, then exercise public JS and types. */
export async function checkPackage() {
  const temporary = await createPackageTempDirectory();
  try {
    const { stdout } = await exec(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
      { cwd: root, maxBuffer: 10 * 1024 * 1024, timeout: 120000 },
    );
    const [packed] = JSON.parse(stdout);
    assert(
      packed?.filename && Array.isArray(packed.files),
      "Unexpected npm pack output",
    );
    const tarball = join(temporary, packed.filename);
    const archive = join(temporary, "archive");
    const consumer = join(temporary, "consumer");
    await mkdir(archive);
    await mkdir(consumer);
    await exec("tar", ["-xzf", tarball, "-C", archive]);
    const unpacked = join(archive, "package");
    const files = await readTree(unpacked);
    const manifest = JSON.parse(files.get("package.json"));
    assert.deepEqual(
      [...files.keys()].sort(),
      packed.files.map(({ path }) => path).sort(),
      "npm pack list differs from actual tarball",
    );
    validatePackage(files, manifest);
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify({
        name: "packed-consumer",
        private: true,
        type: "module",
      }),
    );
    await exec(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--prefer-offline",
        tarball,
      ],
      { cwd: consumer, maxBuffer: 10 * 1024 * 1024, timeout: 120000 },
    );
    const installed = join(consumer, "node_modules", manifest.name);
    assert(
      !(await lstat(installed)).isSymbolicLink(),
      "Consumer installed a checkout symlink",
    );
    const installedReal = await realpath(installed);
    assert.equal(
      installedReal,
      installed,
      "Installed package resolves through a symlink",
    );
    const fromRoot = relative(root, installedReal);
    assert(
      fromRoot === ".." ||
        fromRoot.startsWith(`..${sep}`) ||
        isAbsolute(fromRoot),
      "Consumer resolved inside the checkout",
    );
    const installedFiles = await readTree(installed);
    validatePackage(
      installedFiles,
      JSON.parse(installedFiles.get("package.json")),
    );
    const keys = Object.keys(manifest.exports);
    const specifier = (key) =>
      key === "." ? manifest.name : `${manifest.name}/${key.slice(2)}`;
    const nodeKeys = keys.filter((key) => !key.startsWith("./runtimes/deno"));
    await writeFile(
      join(consumer, "smoke.mjs"),
      `import assert from "node:assert/strict";
${nodeKeys.map((key) => `await import(${JSON.stringify(specifier(key))});`).join("\n")}
const { default: createFetchCache } = await import(${JSON.stringify(manifest.name)});
const { default: MemoryStore } = await import(${JSON.stringify(`${manifest.name}/stores/memory`)});
let fetchCalls = 0;
const cache = createFetchCache({
  Store: MemoryStore,
  mode: "auto",
  fetch: async () => {
    fetchCalls += 1;
    assert.equal(fetchCalls, 1, "Replay must not call the fetch stub");
    return new Response(JSON.stringify({ packed: true }), {
      headers: { "content-type": "application/json" },
    });
  },
});
const url = "https://packed-consumer.test/fixture";
const recorded = await cache(url, undefined);
assert.equal(recorded.headers.get("X-FMC-Cache"), "MISS");
assert.deepEqual(await recorded.json(), { packed: true });
cache.options = { mode: "replay" };
const replayed = await cache(url, undefined);
assert.equal(replayed.headers.get("X-FMC-Cache"), "HIT");
assert.deepEqual(await replayed.json(), { packed: true });
await assert.rejects(cache(url + "/missing", undefined), /cache miss in replay mode/);
assert.equal(fetchCalls, 1);
`,
    );
    await exec(process.execPath, ["smoke.mjs"], {
      cwd: consumer,
      env: { ...process.env, NODE_PATH: "" },
      timeout: 60000,
    });
    const types = `${keys.map((key, i) => `import type * as Entry${i} from ${JSON.stringify(specifier(key))};`).join("\n")}
import createFetchCache, { type CreateFetchCacheOptions, type FetchCache, type FetchCacheMode, type FetchCacheOptions, type ReadCacheOption, type WriteCacheOption, type Runtime } from "fetch-mock-cache";
import MemoryStore from "fetch-mock-cache/stores/memory";
import FileStore from "fetch-mock-cache/stores/fs";
import type { FMCStoreOptions, FMCCacheContent } from "fetch-mock-cache/store";
import type { SerializedBody } from "fetch-mock-cache/cache";
const options: Partial<CreateFetchCacheOptions> = { Store: MemoryStore, mode: "replay" };
const cache: FetchCache = createFetchCache(options);
const mode: FetchCacheMode = "replay";
const policy: FetchCacheOptions = { mode };
const read: ReadCacheOption = true;
const write: WriteCacheOption = false;
const body: SerializedBody = { bodyText: "consumer" };
void [cache, FileStore, policy, read, write, body];
export type PublicContracts = [Runtime, FMCStoreOptions, FMCCacheContent];
`;
    await writeFile(join(consumer, "consumer.ts"), types);
    await writeFile(
      join(consumer, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: [],
          lib: ["ES2022", "DOM", "DOM.Iterable"],
        },
        files: ["consumer.ts"],
      }),
    );
    const tsc = join(
      dirname(require.resolve("typescript/package.json")),
      "bin",
      "tsc",
    );
    await exec(
      process.execPath,
      [tsc, "--project", join(consumer, "tsconfig.json")],
      { cwd: consumer, maxBuffer: 10 * 1024 * 1024, timeout: 60000 },
    );
    console.log(
      `Packed consumer passed: ${keys.length} export aliases, JavaScript record/replay, strict TypeScript, and complete relative imports.`,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  checkPackage().catch((error) => {
    console.error(error.stdout || error.stderr || error.message);
    process.exitCode = 1;
  });
}
