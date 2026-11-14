import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateDocJson,
  validateExportParity,
  validateReexportDocs,
} from "./check-jsr.mjs";

const entrypoint = "file:///example/src/cache.ts";

// Minimal structural fixture captured from Deno 2.9.8's real cache.ts output.
function documentedModule() {
  return {
    version: 2,
    nodes: {
      [entrypoint]: {
        module_doc: {
          doc: "Shared cache fixture types used by stores and runtime adapters.\n",
          tags: [{ kind: "module" }],
        },
        symbols: [
          {
            name: "SerializedBody",
            declarations: [
              {
                declarationKind: "export",
                kind: "typeAlias",
                jsDoc: {
                  doc: "Serialized representation of a request or response body in fixture JSON.",
                },
              },
            ],
          },
        ],
      },
    },
  };
}

test("accepts the pinned Deno v2 module shape and default export names", () => {
  const document = documentedModule();
  document.nodes[entrypoint].symbols[0].name = "default";
  validateDocJson(document, entrypoint);
});

test("rejects undocumented exported symbols", () => {
  const document = documentedModule();
  document.nodes[entrypoint].symbols[0].declarations[0].jsDoc = {};
  assert.throws(
    () => validateDocJson(document, entrypoint),
    /Missing documentation for SerializedBody/,
  );
});

test("validates each entrypoint independently in combined Deno output", () => {
  const document = documentedModule();
  const sibling = "file:///example/src/store.ts";
  document.nodes[sibling] = structuredClone(document.nodes[entrypoint]);
  document.nodes[sibling].symbols[0].name = "FMCStore";
  validateDocJson(document, entrypoint);
  validateDocJson(document, sibling);
  delete document.nodes[sibling].symbols[0].declarations[0].jsDoc;
  validateDocJson(document, entrypoint);
  assert.throws(
    () => validateDocJson(document, sibling),
    /Missing documentation for FMCStore/,
  );
});

test("rejects unknown JSON versions and missing root modules", () => {
  assert.throws(
    () => validateDocJson({ ...documentedModule(), version: 3 }, entrypoint),
    /Unsupported Deno doc JSON version/,
  );
  assert.throws(
    () => validateDocJson(documentedModule(), "file:///other.ts"),
    /Missing documentation module/,
  );
});

test("requires module prose and the module tag", () => {
  for (const moduleDoc of [
    { doc: "Summary" },
    { tags: [{ kind: "module" }] },
  ]) {
    const document = documentedModule();
    document.nodes[entrypoint].module_doc = moduleDoc;
    assert.throws(
      () => validateDocJson(document, entrypoint),
      /Missing @module documentation/,
    );
  }
});

test("rejects private exposed declarations and malformed symbols", () => {
  const document = documentedModule();
  document.nodes[entrypoint].symbols[0].declarations[0].declarationKind =
    "private";
  assert.throws(
    () => validateDocJson(document, entrypoint),
    /Private type exposed by SerializedBody/,
  );
  document.nodes[entrypoint].symbols[0].declarations = [];
  assert.throws(
    () => validateDocJson(document, entrypoint),
    /Missing declarations/,
  );
});

test("ignores import records rather than demanding exported prose", () => {
  const document = documentedModule();
  document.nodes[entrypoint].symbols.push({
    name: "internalImport",
    declarations: [{ kind: "import" }],
  });
  validateDocJson(document, entrypoint);
});

test("requires documentation directly on each named re-export", () => {
  validateReexportDocs(`export type {
    /** Options accepted by the cache. */ Options,
    /** Returned cached fetch. */ Fetch,
  } from "./cache.js";`);
  assert.throws(
    () =>
      validateReexportDocs(`/** A group-level summary is insufficient. */
      export type {
        /** Documented. */ Options,
        Fetch,
      } from "./cache.js";`),
    /Missing direct re-export documentation for Fetch/,
  );
});

test("checks default re-export specifiers and ignores wildcard exports", () => {
  validateReexportDocs(`export {
    /** Default cache factory. */ default,
  } from "./node.js";
  export * from "./node.js";`);
  assert.throws(
    () => validateReexportDocs('export { default } from "./node.js";'),
    /Missing direct re-export documentation for default/,
  );
});

test("requires namespace re-export documentation on its declaration", () => {
  validateReexportDocs(`/** Public cache helpers. */
    export * as cache from "./cache.js";`);
  assert.throws(
    () => validateReexportDocs('export * as cache from "./cache.js";'),
    /Missing namespace re-export documentation for cache/,
  );
});

test("checks imported symbols re-exported by local alias", () => {
  validateReexportDocs(`import type { Options as Imported } from "./cache.js";
    export type { /** Cache options. */ Imported as Options };`);
  for (const source of [
    'import { X } from "./cache.js"; export { X };',
    'import { X as Local } from "./cache.js"; export { Local as X };',
    'import Factory from "./cache.js"; export { Factory as default };',
    'import * as Helpers from "./cache.js"; export { Helpers };',
  ]) {
    assert.throws(
      () => validateReexportDocs(source),
      /Missing direct re-export documentation/,
    );
  }
});

test("leaves exports of local declarations to the Deno documentation check", () => {
  validateReexportDocs(`/** Locally declared options. */
    interface LocalOptions { value: string }
    export type { LocalOptions as Options };
    /** A local factory. */
    const factory = () => 1;
    export { factory };`);
});

test("checks npm/JSR export aliases and target parity", () => {
  validateExportParity(
    { ".": "./lib/index.js", "./cache.ts": "./lib/cache.js" },
    { ".": "./src/index.ts", "./cache.ts": "./src/cache.ts" },
  );
  assert.throws(
    () => validateExportParity({ ".": "./lib/index.js" }, {}),
    /export keys differ/,
  );
  assert.throws(
    () =>
      validateExportParity(
        { ".": "./lib/index.js" },
        { ".": "./src/other.ts" },
      ),
    /export targets differ/,
  );
});
