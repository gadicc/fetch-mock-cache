import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  createPackageTempDirectory,
  validatePackage,
} from "./check-package.mjs";

function fixture() {
  return new Map([
    ["package.json", "{}"],
    ["README.md", "readme"],
    ["LICENSE.txt", "license"],
    ["MIGRATING.md", "migration"],
    ["lib/index.js", 'export { value } from "./nested/helper.js";'],
    ["lib/index.d.ts", 'export { value } from "./nested/helper.js";'],
    ["lib/nested/helper.js", "export const value = 1;"],
    ["lib/nested/helper.d.ts", "export declare const value: number;"],
    [
      "lib/runtimes/deno.js",
      'import "../nested/helper.js"; import "@std/path";',
    ],
    ["lib/runtimes/deno.d.ts", 'export { value } from "../nested/helper.js";'],
  ]);
}
const manifest = {
  exports: {
    ".": "./lib/index.js",
    "./runtimes/deno": "./lib/runtimes/deno.js",
  },
};

test("validates declarations and transitive relative imports for all runtimes", () => {
  const checked = validatePackage(fixture(), manifest);
  assert(checked.has("lib/runtimes/deno.js"));
  assert(checked.has("lib/nested/helper.d.ts"));
});

for (const missing of [
  "lib/index.js",
  "lib/index.d.ts",
  "lib/nested/helper.js",
  "lib/nested/helper.d.ts",
  "MIGRATING.md",
]) {
  test(`rejects a tarball missing ${missing}`, () => {
    const files = fixture();
    files.delete(missing);
    assert.throws(() => validatePackage(files, manifest), /Missing/);
  });
}
for (const name of [
  "lib/stores/fs.spec.js",
  "lib/stores/fs.test.js",
  "lib/stores/fs.spec.d.ts",
  "lib/testUtils.js",
  "lib/temp_regenerate.d.ts",
]) {
  test(`rejects accidentally shipped ${name}`, () => {
    const files = fixture();
    files.set(name, "");
    assert.throws(
      () => validatePackage(files, manifest),
      /Test\/helper artifact/,
    );
  });
}

test("rejects missing Deno adapter internal imports without executing the adapter", () => {
  const files = fixture();
  files.set("lib/runtimes/deno.js", 'import "../missing.js";');
  assert.throws(
    () => validatePackage(files, manifest),
    /Missing relative dependency/,
  );
});

test("accepts already explicit declaration imports", () => {
  const files = fixture();
  files.set("lib/index.d.ts", 'export { value } from "./nested/helper.d.ts";');
  assert(validatePackage(files, manifest).has("lib/nested/helper.d.ts"));
});

test("rejects a relative import outside the archive", () => {
  const files = fixture();
  files.set("lib/index.js", 'import "../../outside.js";');
  assert.throws(
    () => validatePackage(files, manifest),
    /Missing relative dependency/,
  );
});

test("follows static dynamic-import targets", () => {
  const files = fixture();
  files.set(
    "lib/index.js",
    'export async function load() { return import("./missing.js"); }',
  );
  assert.throws(
    () => validatePackage(files, manifest),
    /Missing relative dependency/,
  );
});

test("canonicalizes a symlinked temporary-directory parent", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "fmc-temp-parent-"));
  try {
    const canonical = join(temporary, "canonical");
    const alias = join(temporary, "alias");
    await mkdir(canonical);
    await symlink(canonical, alias, "dir");
    const consumer = await createPackageTempDirectory(alias);
    assert.equal(dirname(consumer), await realpath(canonical));
    assert.equal(consumer, await realpath(consumer));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
