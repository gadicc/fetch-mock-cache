import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const publishArgs = ["--allow-dirty", "--unstable-sloppy-imports"];

function uniqueArgs(args) {
  return [...new Set(args)];
}

async function parseConfig(pluginConfig, context) {
  pluginConfig ??= {};

  const cwd = pluginConfig.cwd || context?.cwd || process.cwd();
  const versionJsonPaths = [
    join(cwd, "jsr.json"),
    join(cwd, "deno.json"),
  ].filter((path) => existsSync(path));

  if (versionJsonPaths.length === 0) {
    throw new Error("No jsr.json or deno.json found for JSR publish");
  }

  let name;
  for (const path of versionJsonPaths) {
    const json = JSON.parse(await readFile(path, "utf8"));
    name ??= json.name;
  }

  if (!name) {
    throw new Error("No package name found in jsr.json or deno.json");
  }

  return {
    cwd,
    name,
    publishArgs: uniqueArgs([
      ...publishArgs,
      ...(pluginConfig.publishArgs ?? []),
    ]),
    versionJsonPaths,
  };
}

async function runDenoPublish(config, context, extraArgs = []) {
  const args = ["publish", ...config.publishArgs, ...extraArgs];
  const logger = context.logger;

  logger.log("Run deno %s in %s", args.join(" "), config.cwd);

  await new Promise((resolve, reject) => {
    const child = spawn("deno", args, {
      cwd: config.cwd,
      env: {
        ...process.env,
        ...(context.env ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.pipe(context.stdout ?? process.stdout, { end: false });
    child.stderr.pipe(context.stderr ?? process.stderr, { end: false });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`deno publish exited with code ${code}`));
    });
  });
}

async function updateVersionJson(file, context) {
  if (!context.nextRelease) {
    return;
  }

  context.logger.log("Updating version in %s", file);
  const nextVersion = context.nextRelease.version;
  const content = await readFile(file, "utf8");

  if (JSON.parse(content).version === nextVersion) {
    context.logger.log("Skipped, %s is already up to date", file);
    return;
  }

  const updatedContent = content.replace(
    /^([\s\S]*"version"\s*:\s*")([^"]+)("[\s\S]*$)/,
    `$1${nextVersion}$3`,
  );

  if (JSON.parse(updatedContent).version !== nextVersion) {
    throw new Error(`Failed to update version in ${file}`);
  }

  await writeFile(file, updatedContent, "utf8");
  context.logger.log("Wrote new version to %s", file);
}

export async function verifyConditions(pluginConfig, context) {
  const config = await parseConfig(pluginConfig, context);

  context.logger.info("Run deno publish --dry-run to verify JSR");
  await runDenoPublish(config, context, ["--dry-run"]);
}

export async function prepare(pluginConfig, context) {
  const config = await parseConfig(pluginConfig, context);

  for (const path of config.versionJsonPaths) {
    await updateVersionJson(path, context);
  }
}

export async function publish(pluginConfig, context) {
  const config = await parseConfig(pluginConfig, context);

  await runDenoPublish(config, context);

  return {
    name: "JSR.io",
    url: context.nextRelease
      ? `https://jsr.io/${config.name}@${context.nextRelease.version}`
      : `https://jsr.io/${config.name}/versions`,
  };
}

export default {
  prepare,
  publish,
  verifyConditions,
};
