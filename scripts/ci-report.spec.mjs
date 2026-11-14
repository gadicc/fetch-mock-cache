import assert from "node:assert/strict";
import test from "node:test";
import {
  badge,
  buildReport,
  parseCoverage,
  parseResults,
} from "./ci-report.mjs";

const results =
  "node:\n    native: pass\n    jest: pass\n    vitest: pass\ndeno:\n    native: pass\nbun:\n    native: pass\n";
const coverage = "SF:src/example.ts\nLF:10\nLH:9\nend_of_record\n";
const metadata = {
  sha: "a".repeat(40),
  attempt: "2",
  artifactAttempt: "1",
  generatedAt: "2026-11-14T00:00:00Z",
  runUrl: "https://github.com/gadicc/fetch-mock-cache/actions/runs/1",
};

test("successful report includes all suites, coverage, and run identity", () => {
  const { files, summary } = buildReport({
    coverage,
    results,
    outcome: "success",
    metadata,
  });
  assert.match(files["coverage.svg"], /90.0%/);
  assert.match(files["runtime-node-jest.svg"], /pass/);
  assert.match(files["index.html"], new RegExp(metadata.sha));
  assert.match(files["index.html"], /2026-11-14T00:00:00Z/);
  assert.match(files["index.html"], /Test data attempt 1/);
  assert.equal(JSON.parse(files["meta.json"]).artifactAttempt, "1");
  assert.equal(JSON.parse(files["meta.json"]).runUrl, metadata.runUrl);
  assert.match(summary, /Coverage: \*\*90.0%\*\*/);
});

test("failed run marks missing suites and coverage unknown", () => {
  const { files } = buildReport({
    coverage,
    results: "node:\n    native: fail\n",
    outcome: "failure",
    metadata,
  });
  const data = JSON.parse(files["meta.json"]);
  assert.equal(data.outcome, "failure");
  assert.equal(data.coverage, null);
  assert.equal(data.runtimes["node-native"], "fail");
  assert.equal(data.runtimes["node-jest"], "unknown");
  assert.match(files["coverage.svg"], /unknown/);
});

test("success cannot be published from missing, failing, or malformed inputs", () => {
  assert.throws(() => parseResults("", true), /missing/);
  assert.throws(
    () => parseResults(results.replace("pass", "fail"), true),
    /failing/,
  );
  for (const text of [
    "node:\n    native: green",
    "evil:\n    native: pass",
    `${results}node:\n`,
    `${results}    native: pass\n`,
  ]) {
    assert.throws(() => parseResults(text, false));
  }
  assert.throws(
    () => buildReport({ results, outcome: "success", metadata }),
    /LCOV/,
  );
  assert.throws(() =>
    buildReport({ results, coverage, outcome: "maybe", metadata }),
  );
});

test("LCOV aggregates line totals and does not invent coverage", () => {
  assert.equal(parseCoverage(`${coverage}${coverage}`), 90);
  assert.equal(parseCoverage(coverage.replace("LH:9", "LH:0")), 0);
  assert.equal(
    parseCoverage(coverage.replace("LF:10", "LF:0").replace("LH:9", "LH:0")),
    null,
  );
  for (const value of [
    "",
    "SF:a\nLF:1\nend_of_record\n",
    coverage.replace("LH:9", "LH:11"),
    coverage.replace("LF:10", "LF:no"),
    "SF:a\n",
  ]) {
    assert.throws(() => parseCoverage(value));
  }
});

test("SVG and HTML escape metadata as text", () => {
  const svg = badge('<script>"', "<&'", "#777");
  assert.ok(!svg.includes("<script>"));
  assert.match(svg, /&lt;script&gt;&quot;/);
  const { files } = buildReport({
    coverage,
    results,
    outcome: "success",
    metadata: {
      ...metadata,
      sha: "<script>alert(1)</script>",
      runUrl: '\" onclick=\"bad',
    },
  });
  assert.ok(!files["index.html"].includes("<script>"));
  assert.match(files["index.html"], /&quot; onclick=&quot;bad/);
});

test("truncated failure results discard partial passes and publish unknowns", () => {
  const { files } = buildReport({
    coverage,
    results: "node:\n    native: pass\n    jest: pa",
    outcome: "failure",
    metadata,
  });
  const data = JSON.parse(files["meta.json"]);
  assert.ok(
    Object.values(data.runtimes).every((status) => status === "unknown"),
  );
  assert.equal(data.coverage, null);
  assert.match(data.warnings[0], /Malformed/);
  assert.match(files["index.html"], /all suites are unknown/);
});
