# Plan 018: Validate JSR documentation and publishability before merge

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
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
git diff --stat 8d9f303..HEAD -- scripts/check-jsr.mjs scripts/check-jsr.spec.mjs package.json .github/workflows/test.yml docs/ci-release.md plans/018-jsr-pr-validation.md plans/README.md
```

Compare excerpts below with the current tree, including uncommitted changes from
other selected plans. Expected overlapping changes are not drift failures.

## Why this matters

Repository policy requires JSR module/member docs and a 100% symbol score, but PR CI currently checks build, Biome, coverage and runtime examples only. Detect doc/publication regressions before the release job.

## Current state

`AGENTS.md` prescribes deno doc --lint --quiet --no-lock --unstable-sloppy-imports against all jsr.json exports, using a temporary import map when needed, plus JSON top-level symbol jsDoc.doc checks. `scripts/semantic-release-jsr.mjs:109` runs deno publish --dry-run only during release. Export aliases map to eight unique source entrypoints.

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

- `AGENTS.md` — coherence update for automated verification commands.

- `scripts/check-jsr.mjs`
- `scripts/check-jsr.spec.mjs`
- `package.json`
- `.github/workflows/test.yml`
- `docs/ci-release.md`
- `plans/018-jsr-pr-validation.md`
- `plans/README.md`

Out of scope: src/, generated lib/, fixtures, public exports/API semantics,
package/jsr placeholder versions, remote publishing, deleting secrets, and remote
security policy mutations. No new service credentials.

The Opus review decisions below supersede initial step details where noted.

## Steps and verification gates

1. Add a Node ESM script deriving unique exported entrypoints from jsr.json, generating a temporary import map from jsr.json imports. Invoke Deno directly with argument arrays, no shell interpolation. Lint every entrypoint and inspect deno doc --json: ignore import records and require real top-level exported symbol documentation. Understand the actual Deno JSON shape and handle default/re-export/alias records without suppressing missing documentation. Clean temporary files on success/failure.
2. Run deno publish --dry-run --config jsr.json --allow-dirty --unstable-sloppy-imports as a separate publishability gate, without tokens or elevated permissions. Prevent creation/update of tracked lockfiles; honor the checked-in publish include/exclude policy.
3. Expose pnpm run check:jsr; invoke it in the Deno-equipped reusable test job after core CI checks. Keep ordinary pnpm run ci usable on documented installed runtimes; document where the added JSR gate runs. Add focused tests for symbol extraction and missing doc rejection, rather than asserting command text.

After each step, run its focused script tests or inspect the modified workflow
with a YAML/action validator before proceeding. Expected result: exit 0 and the
behavior described in that step. Run the complete commands below at integration.

## Test plan and done criteria

`pnpm run check:jsr` exits 0 and checks all eight unique modules. A synthetic undocumented top-level symbol is rejected in the script unit test. Run tracked-file diff after validation: no lock/config mutation. PR permissions remain contents:read. `pnpm run ci` and `pnpm biome ci` pass.

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

Implementation clarification: run Deno lint and JSON once each with all eight
public entrypoints together, then inspect every corresponding root module.
This preserves public types exported by sibling entrypoints; a per-module lint
produces false private-type-reference diagnostics on the existing valid API.
