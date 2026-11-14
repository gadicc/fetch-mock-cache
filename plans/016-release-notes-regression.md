# Plan 016: Restore feature, fix, and breaking-change release notes

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8d9f303`, 2026-11-14

## Execution contract

User explicitly requested plans, Claude Code Opus 5.5 plan review, implementation
in this checkout, then Claude Code Fable 5.2 adversarial review and fixes here.
That request overrides the improve skill's advisor-only/worktree defaults.
The user subsequently authorized commit/push, hosted checks, and follow-up fixes.
Complete requested review and validation before pushing. Inspect Pages state
before enabling the selected reporting destination; avoid unrelated account
policy changes.
Review the drift command before starting:

```sh
git diff --stat 8d9f303..HEAD -- release.config.mjs package.json pnpm-lock.yaml scripts/release-notes.spec.mjs plans/016-release-notes-regression.md plans/README.md
```

Compare excerpts below with the current tree, including uncommitted changes from
other selected plans. Expected overlapping changes are not drift failures.

## Why this matters

Installed conventional-changelog-conventionalcommits 10.2.1 with release-notes-generator 14.1.1 produces only a version heading. Published v3.1.0 has that symptom. The next major release must include its migration details; version analysis currently still correctly returns major.

## Current state

`release.config.mjs:28` sets `preset: "conventionalcommits"`. `package.json` declares conventional-changelog-conventionalcommits ^10.2.1. The installed preset uses function templates while the installed generator depends on an older writer. A synthetic `fix(store)!` message with a BREAKING CHANGE footer generates an empty heading body.

## Conventions and commands

TypeScript ESM package; automation scripts are Node ESM .mjs like
`scripts/semantic-release-jsr.mjs` (`import { spawn } from "node:child_process";`).
Use two-space indentation, double quotes, semicolons, descriptive kebab-case
filenames, no any or namespaces. Keep source API, README, agent skill and examples
coherent; this work does not change the user-facing cache API. Never edit lib.
Use pnpm 10.34.4. `pnpm run build` invokes tsc; `pnpm test` runs colocated specs;
`pnpm biome check --write <changed-supported-paths>` formats/organizes imports;
`pnpm biome ci` checks formatting/lint; `pnpm run ci` builds, lints, measures
coverage and runs Node/Jest/Vitest/Deno/Bun runtime examples. Each exits 0 on success.
Use focused `node --test scripts/*.spec.mjs` gates for new automation regressions.

## Scope

Only these files may change for this plan:

- `release.config.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/release-notes.spec.mjs`
- `plans/016-release-notes-regression.md`
- `plans/README.md`

Out of scope: src/, generated lib/, fixtures, public exports/API semantics,
package/jsr placeholder versions, remote publishing, deleting secrets, and remote
security policy mutations. No new service credentials.

The Opus review decisions below supersede initial step details where noted.

## Steps and verification gates

1. Add a network-free regression using the installed semantic-release note generator and analyzer, following the real configured preset. Supply feature, scoped fix, and breaking-change commits; assert all subjects and migration text are rendered, compare links point to the repo, and major/minor/patch analysis remains correct. No semantic-release command that can publish is permitted in tests.
2. Resolve the preset/generator compatibility with a verified compatible pinned major or compatible upgraded generator. Prefer a minimal dependency change over changing commit conventions or introducing handwritten changelog rendering. Keep lockfile synchronized using pnpm 10.
3. Add the regression to a CI script invoked by ci:core. Make failures visible before merge. Do not alter package placeholder versions or rewrite historical releases.

After each step, run its focused script tests or inspect the modified workflow
with a YAML/action validator before proceeding. Expected result: exit 0 and the
behavior described in that step. Run the complete commands below at integration.

## Test plan and done criteria

`node --test scripts/release-notes.spec.mjs` passes with actual configured plugin settings; the regression fails on the original dependency combination. `pnpm run ci` and `pnpm biome ci` pass. Git diff contains no public API changes.

- Run `git diff --check`: no whitespace errors.
- Review `git status --short` against the combined scope of selected plans.
- Record actual commands/results and unresolved hosted-only checks in the index.
- Obtain requested Opus review before implementation and Fable review afterward;
  validate all material findings and fix them here, preserving review records.

## STOP conditions

Stop the affected step and report if a verified compatible dependency/action
cannot be obtained, a solution requires a public API change or credentials,
or a gate fails twice with the cause still unknown. Continue independent work.
Never silently replace the requested reviewer model or claim hosted deployment
or account policy was verified from a local check.

## Maintenance notes

Update action pins and release tooling via reviewed automated PRs. Keep report
schema and README badge paths synchronized; guard main-only reporting whenever
new release channels are added. Future exports must be included in JSR and packed
consumer validation. Keep recovery instructions aligned with semantic-release
plugin ordering and registry trusted-publishing requirements.

## Opus review decisions

Reviewed by Claude Code `claude-opus-5-5`; full findings are in
`plans/015-019-opus-review.md`. Consolidate script checks as test:scripts;
implement 016 → 019 → 018 → 015 → 017. Never interpolate event data into shell.
Publish reports independently of release with explicit failure/unknown states,
current-main SHA and latest-run guards, short artifact retention, and escaped
metadata. Pin peeled action commit refs; disable release caching explicitly.
Resolve release test plugins from semantic-release's own installed copy and
merge actual configured options. Pin the compatible conventionalcommits 9.x
preset; the regression gate must reject future incompatible major upgrades.
Validate actual Deno JSON v2 and source re-export specifier documentation via
TypeScript AST; reject unexpected JSON shapes and detect untracked mutations.
Use npm pack and an os.tmpdir consumer, statically check relative imports from
all export targets, and run strict consumer typechecking without root deps.

Architecture decision after verifying remote default_branch=dev: use sibling
reports and deploy-pages jobs in release.yml, as Opus recommended. Release
needs only test; reporting reads raw same-run artifacts and generates a Pages
artifact without OIDC. Deploy runs pinned first-party actions with minimal
Pages/OIDC permissions. Gate reports and deployment on refs/heads/main and
current-main SHA. A reporting failure may make the workflow badge red but
never blocks the release job. Remove unused reports.yml from scope. Document
the github-pages environment policy explicitly, since default branch is dev.
The release environment restriction remains an explicit account-side follow-up;
adding it locally without synchronizing npm settings could break publishing.

Recovery guidance must distinguish tags already pushed from versions actually
published. Never advise a blind semantic-release rerun or a blind tag deletion;
a tag reset is only a deliberate maintainer option if nothing was published.
