# Plan 015: Replace gist badges with independent GitHub Pages reports

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: migration
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
git diff --stat 8d9f303..HEAD -- .github/workflows/release.yml .github/workflows/test.yml scripts/ci-report.mjs scripts/ci-report.spec.mjs README.md docs/ci-release.md package.json .gitignore plans/015-github-pages-ci-reports.md plans/README.md
```

Compare excerpts below with the current tree, including uncommitted changes from
other selected plans. Expected overlapping changes are not drift failures.

## Why this matters

The latest main run passed tests but failed on gist authentication before publishing. Both gist actions run inside the release job. README runtime badges additionally pin an immutable gist revision. Replace these with repository-owned, secret-free static reports without making reporting a prerequisite for package publication.

## Current state

`.github/workflows/release.yml:82` uses `gaelgirodon/ci-badges-action@v1`, then `exuanbo/actions-deploy-gist@v1`, both with `secrets.GH_TOKEN_GISTS`. The release job downloads `coverage` and `runtime-results`. `test.yml` uploads `lcov.info` and `tests/runtimes/results.yaml` only when its `upload_artifacts` input is true. Results use nested runtime keys and pass/fail strings; Node has native/jest/vitest and Bun/Deno have native. README.md:10 points to the old repository name and lines 98–102 pin a gist revision.

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

- `.github/workflows/release.yml`
- `.github/workflows/test.yml`
- `scripts/ci-report.mjs`
- `scripts/ci-report.spec.mjs`
- `README.md`
- `docs/ci-release.md`
- `package.json`
- `.gitignore`
- `plans/015-github-pages-ci-reports.md`
- `plans/README.md`

Out of scope: src/, generated lib/, fixtures, public exports/API semantics,
package/jsr placeholder versions, remote publishing, deleting secrets, and remote
security policy mutations. No new service credentials.

The Opus review decisions below supersede initial step details where noted.

## Steps and verification gates

1. Add a dependency-free Node ESM report generator taking explicit input/output directories and run metadata. Parse LCOV line counts and a deliberately narrow runtime-results schema; reject malformed or incomplete successful reports rather than manufacturing green badges. Generate SVG badges, JSON metadata (commit/run URL/time), runtime YAML, and a small escaped HTML index. Cover XML/HTML escaping, zero coverage, malformed data, and all runtime states with node:test. Reports contain only aggregate metrics and run metadata, never request fixtures.
2. Upload raw coverage/runtime artifacts best-effort in the test job, including failures when files exist. Generate reports and a job summary in a separate contents:read-only reports job after test, including failed test jobs. That job uploads a Pages artifact only for main push/manual runs. Missing suites display unknown; coverage from failed jobs is unknown. Successful jobs with incomplete data are rejected.
3. Remove all gist steps and report downloads from the publishing job. Introduce an independent sibling Pages deployment job with only contents:read, pages:write and id-token:write and the github-pages environment. Deploy only trusted main runs; PRs and release-channel branches must not overwrite main badges. Release must depend only on tests, never reports/deploy. Use Pages concurrency separately from release and prevent older runs from overwriting newer results.
4. Replace README coverage/runtime URLs with https://gadicc.github.io/fetch-mock-cache/ badge paths; fix the workflow badge repository. Document Pages source=GitHub Actions, environment branch restrictions, stale-report semantics, and retiring GH_TOKEN_GISTS after migration. No remote deployment/settings mutation is required to finish local implementation.

After each step, run its focused script tests or inspect the modified workflow
with a YAML/action validator before proceeding. Expected result: exit 0 and the
behavior described in that step. Run the complete commands below at integration.

## Test plan and done criteria

`node --test scripts/ci-report.spec.mjs` passes. No gist references remain in active workflows or README. Main-only deployment is explicit, PR workflow has no Pages/id-token permissions, and release.needs does not include reporting. Generate sample reports in a temporary directory and inspect output; expected metadata links to the supplied run. `pnpm run ci` passes.

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
