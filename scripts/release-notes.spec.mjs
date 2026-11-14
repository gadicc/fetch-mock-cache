import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import config from "../release.config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
// Match semantic-release's installed plugins under pnpm's strict layout.
const releaseRequire = createRequire(require.resolve("semantic-release"));
const pluginPaths = Object.fromEntries(
  ["commit-analyzer", "release-notes-generator"].map((name) => [
    name,
    releaseRequire.resolve(`@semantic-release/${name}`),
  ]),
);
const { analyzeCommits } = await import(
  pathToFileURL(pluginPaths["commit-analyzer"]).href
);
const { generateNotes } = await import(
  pathToFileURL(pluginPaths["release-notes-generator"]).href
);
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

function pluginOptions(name) {
  const entry = config.plugins.find(
    (value) => (Array.isArray(value) ? value[0] : value) === name,
  );
  assert.ok(entry, `${name} must stay configured`);
  return { ...config, ...(Array.isArray(entry) ? entry[1] : {}) };
}

function context(messages) {
  return {
    cwd: root,
    commits: messages.map((message, index) => ({
      hash: `${index + 1}`.repeat(40),
      message,
    })),
    lastRelease: { version: "3.1.0", gitTag: "v3.1.0" },
    nextRelease: { version: "4.0.0", gitTag: "v4.0.0" },
    options: { repositoryUrl: pkg.repository.url.replace(/^git\+/, "") },
    logger: { log() {} },
  };
}

test("configured release plugins render features, fixes, and migration notes", async (t) => {
  for (const [name, path] of Object.entries(pluginPaths)) {
    const plugin = JSON.parse(
      await readFile(join(dirname(path), "package.json"), "utf8"),
    );
    t.diagnostic(`${name}@${plugin.version}: ${path}`);
  }
  const notes = await generateNotes(
    pluginOptions("@semantic-release/release-notes-generator"),
    context([
      "feat(cache): add replay mode",
      "fix(store): preserve empty responses",
      "fix(store)!: change fixture names\n\nBREAKING CHANGE: Re-record fixtures before upgrading.",
    ]),
  );
  for (const text of [
    "add replay mode",
    "preserve empty responses",
    "change fixture names",
    "BREAKING CHANGE",
    "Re-record fixtures before upgrading.",
    "https://github.com/gadicc/fetch-mock-cache/compare/v3.1.0...v4.0.0",
  ]) {
    assert.ok(notes.includes(text), `Missing release note: ${text}\n${notes}`);
  }
});

for (const [message, expected] of [
  ["docs(readme): explain setup", null],
  ["chore(deps): refresh tooling", null],
  ["feat(cache): add replay mode", "minor"],
  ["fix(store): preserve empty responses", "patch"],
  ["fix(store)!: change fixture names", "major"],
  [
    "chore(cache): change defaults\n\nBREAKING CHANGE: Re-record fixtures.",
    "major",
  ],
]) {
  test(`configured analyzer selects ${expected} for ${message.split("\n")[0]}`, async () => {
    assert.equal(
      await analyzeCommits(
        pluginOptions("@semantic-release/commit-analyzer"),
        context([message]),
      ),
      expected,
    );
  });
}
