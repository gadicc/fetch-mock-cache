import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const suites = {
  node: ["native", "jest", "vitest"],
  deno: ["native"],
  bun: ["native"],
};

export function parseResults(text, successful) {
  const results = {};
  let runtime;
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const section = /^([a-z]+):\s*$/.exec(line);
    if (section) {
      runtime = section[1];
      if (!Object.hasOwn(suites, runtime) || seen.has(runtime)) {
        throw new Error(`Invalid or duplicate runtime: ${runtime}`);
      }
      seen.add(runtime);
      continue;
    }
    const result = /^ {2,}([a-z]+): (pass|fail)\s*$/.exec(line);
    if (!result || !runtime || !suites[runtime].includes(result[1])) {
      throw new Error("Malformed runtime results");
    }
    const key = `${runtime}-${result[1]}`;
    if (Object.hasOwn(results, key)) throw new Error(`Duplicate suite: ${key}`);
    results[key] = result[2];
  }
  for (const [name, frameworks] of Object.entries(suites)) {
    for (const framework of frameworks) {
      const key = `${name}-${framework}`;
      if (successful && results[key] !== "pass") {
        throw new Error(
          `Successful test job has missing/failing suite: ${key}`,
        );
      }
      results[key] ??= "unknown";
    }
  }
  return results;
}

export function parseCoverage(text) {
  let record;
  let found = 0;
  let hit = 0;
  let records = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      if (record) throw new Error("Unterminated LCOV record");
      record = {};
    } else if (/^(LF|LH):/.test(line)) {
      const match = /^(LF|LH):(\d+)$/.exec(line);
      if (!record || !match || record[match[1]] !== undefined) {
        throw new Error("Invalid LCOV line totals");
      }
      record[match[1]] = Number(match[2]);
    } else if (line === "end_of_record") {
      if (
        !record ||
        !Number.isSafeInteger(record.LF) ||
        !Number.isSafeInteger(record.LH) ||
        record.LH > record.LF
      ) {
        throw new Error("Missing or inconsistent LCOV line totals");
      }
      found += record.LF;
      hit += record.LH;
      record = undefined;
      records++;
    }
  }
  if (record || !records || !Number.isSafeInteger(found)) {
    throw new Error("Incomplete LCOV report");
  }
  return found ? (100 * hit) / found : null;
}

function escape(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

export function badge(label, message, color) {
  const width = Math.max(160, (label.length + message.length) * 8 + 24);
  const middle = Math.ceil(width * 0.6);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" role="img" aria-label="${escape(`${label}: ${message}`)}"><title>${escape(`${label}: ${message}`)}</title><rect width="${width}" height="24" rx="4" fill="#555"/><path fill="${color}" d="M${middle} 0h${width - middle}v24H${middle}z"/><g fill="white" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="${middle / 2}" y="16">${escape(label)}</text><text x="${middle + (width - middle) / 2}" y="16">${escape(message)}</text></g></svg>\n`;
}

export function buildReport({ coverage, results, outcome, metadata }) {
  if (!["success", "failure", "cancelled", "skipped"].includes(outcome)) {
    throw new Error("Invalid test job outcome");
  }
  const successful = outcome === "success";
  let parsedResults;
  const warnings = [];
  try {
    parsedResults = parseResults(results ?? "", successful);
  } catch (error) {
    if (successful) throw error;
    parsedResults = parseResults("", false);
    warnings.push("Malformed runtime results; all suites are unknown.");
  }
  // Coverage from a failing job must never look like a passing baseline.
  const percent = successful ? parseCoverage(coverage ?? "") : null;
  const message = percent === null ? "unknown" : `${percent.toFixed(1)}%`;
  const files = {};
  const addBadge = (name, label, value, color) => {
    files[`${name}.svg`] = badge(label, value, color);
    files[`${name}.json`] =
      `${JSON.stringify({ schemaVersion: 1, label, message: value, color }, null, 2)}\n`;
  };
  addBadge(
    "coverage",
    "coverage",
    message,
    percent === null ? "#777" : percent >= 90 ? "#187a39" : "#9c5200",
  );
  const rows = Object.entries(parsedResults).map(([name, status]) => {
    addBadge(
      `runtime-${name}`,
      name,
      status,
      status === "pass" ? "#187a39" : status === "fail" ? "#b22" : "#777",
    );
    return `<tr><td>${escape(name)}</td><td>${escape(status)}</td></tr>`;
  });
  files["meta.json"] =
    `${JSON.stringify({ ...metadata, outcome, coverage: percent, runtimes: parsedResults, warnings }, null, 2)}\n`;
  files["results.yaml"] = Object.entries(suites)
    .map(
      ([runtime, frameworks]) =>
        `${runtime}:\n${frameworks.map((framework) => `    ${framework}: ${parsedResults[`${runtime}-${framework}`]}`).join("\n")}\n`,
    )
    .join("");
  files["index.html"] =
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>fetch-mock-cache CI report</title><style>body{font:16px system-ui;max-width:50rem;margin:3rem auto;padding:0 1rem;color:#222}td,th{padding:.4rem 1rem;text-align:left}code{overflow-wrap:anywhere}</style><h1>fetch-mock-cache CI report</h1><p>Test job: <strong>${escape(outcome)}</strong>. Coverage: ${escape(message)}.</p><p>Commit <code>${escape(metadata.sha)}</code><br>Generated ${escape(metadata.generatedAt)}<br><a href="${escape(metadata.runUrl)}">Source workflow run (attempt ${escape(metadata.attempt)})</a><br>Test data attempt ${escape(metadata.artifactAttempt ?? metadata.attempt)}</p><p>${warnings.map((warning) => escape(warning)).join(" ")} This is the last deployed report. Check the commit and run time before relying on a badge; unavailable suites show unknown.</p><table><thead><tr><th>Runtime / framework</th><th>Result</th></tr></thead><tbody>${rows.join("")}</tbody></table><p><a href="meta.json">Report metadata</a></p></html>\n`;
  const summary = `### CI report\n\nTest job: **${outcome}**. Coverage: **${message}**.\n\n[Workflow run](${metadata.runUrl}), commit \`${metadata.sha}\`.\n\n${Object.entries(
    parsedResults,
  )
    .map(([name, status]) => `- ${name}: ${status}`)
    .join("\n")}\n`;
  return { files, summary };
}

async function optionalFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function main() {
  const [input, output, outcome] = process.argv.slice(2);
  if (input === "--validate") {
    if (!output || !outcome)
      throw new Error("Usage: ci-report.mjs --validate LCOV RESULTS");
    parseCoverage(await readFile(output, "utf8"));
    parseResults(await readFile(outcome, "utf8"), true);
    console.log("Report parser passed actual coverage and runtime results.");
    return;
  }
  if (!input || !output)
    throw new Error("Usage: ci-report.mjs INPUT OUTPUT OUTCOME");
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const runId = process.env.GITHUB_RUN_ID;
  const attempt = process.env.GITHUB_RUN_ATTEMPT;
  const artifactAttempt = process.env.TEST_ARTIFACT_ATTEMPT ?? attempt;
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") ||
    !/^[a-f0-9]{40}$/.test(sha ?? "") ||
    !/^\d+$/.test(runId ?? "") ||
    !/^\d+$/.test(attempt ?? "") ||
    !/^\d+$/.test(artifactAttempt ?? "")
  ) {
    throw new Error("Missing or invalid GitHub run metadata");
  }
  const { files, summary } = buildReport({
    coverage: await optionalFile(resolve(input, "lcov.info")),
    results: await optionalFile(resolve(input, "results.yaml")),
    outcome,
    metadata: {
      sha,
      attempt,
      artifactAttempt,
      generatedAt: new Date().toISOString(),
      runUrl: `https://github.com/${repository}/actions/runs/${runId}/attempts/${attempt}`,
    },
  });
  await mkdir(output, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(resolve(output, name), contents);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: "a" });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
