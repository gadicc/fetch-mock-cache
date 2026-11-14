# Plan 017: Constrain release tooling and document registry recovery

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 015
- **Category**: security
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
git diff --stat 8d9f303..HEAD -- .github/workflows/release.yml .github/workflows/test.yml .github/workflows/pr.yml .github/dependabot.yml docs/ci-release.md plans/017-release-workflow-hardening.md plans/README.md
```

Compare excerpts below with the current tree, including uncommitted changes from
other selected plans. Expected overlapping changes are not drift failures.

## Why this matters

The release job grants repository writes and OIDC to mutable-tag third-party actions, and restores a dependency cache. The registry trust setup previously worked but live account restrictions could not be inspected. Harden code-controlled boundaries and document the remaining account-side checks and recovery steps.

## Current state

`release.yml:35–40` grants contents/issues/pull-requests write and id-token write. `setup-node` restores pnpm cache; actions use major tags. Node is 22.14 and npm is upgraded using ^11.5.1. `release.config.mjs` publishes npm, then native JSR, then GitHub. Main is reported unprotected by GitHub; no repository rulesets exist.

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
- `.github/workflows/pr.yml`
- `.github/dependabot.yml`
- `docs/ci-release.md`
- `plans/017-release-workflow-hardening.md`
- `plans/README.md`

Out of scope: src/, generated lib/, fixtures, public exports/API semantics,
package/jsr placeholder versions, remote publishing, deleting secrets, and remote
security policy mutations. No new service credentials.

The Opus review decisions below supersede initial step details where noted.

## Steps and verification gates

1. Pin every used GitHub action to a verified upstream commit SHA with a human-readable version comment. Use current supported official action versions; configure Dependabot for GitHub Actions updates (and a conservative npm update cadence if useful). Do not guess SHAs.
2. Disable package-manager caching in the release job and retain it for read-only test jobs. Keep pnpm 10.34.4, frozen lockfile installs and ignored lifecycle scripts. Pin compatible Node/npm/Deno release tool versions and keep test Deno aligned. Preserve semantic-release git push authentication and full history; do not disable checkout credentials without providing and verifying a replacement.
3. Preserve OIDC publishing with no NPM_TOKEN/JSR_TOKEN. Document npm trusted publisher owner=gadicc, repo=fetch-mock-cache, filename=release.yml, matching optional environment, direct publish and channel dist-tag permissions where needed. Document JSR linked repository, recommended npm token/2FA policy, and branch rules. Remote account policies are a maintainer task; never claim they changed locally.
4. Add a partial-publication recovery runbook: inspect existing tag, npm version, JSR version and provenance before retrying; preserve version/commit identity, repair only missing destinations with deliberate review, never delete tags or bump versions blindly. Document that publish dry-run does not prove live authorization. Keep branch-protection and npm/JSR settings changes outside this code patch.

After each step, run its focused script tests or inspect the modified workflow
with a YAML/action validator before proceeding. Expected result: exit 0 and the
behavior described in that step. Run the complete commands below at integration.

## Test plan and done criteria

Every uses reference resolves to an upstream commit and has a version comment. Dependabot YAML is valid. Release has no cache restore, no gist actions, and still grants id-token only where needed. `pnpm biome ci`, workflow validation (actionlint if available), and `pnpm run ci` pass. Runbook separates verified local properties from outstanding remote settings.

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
