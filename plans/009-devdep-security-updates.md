# Plan 009: Clear the dev-dependency audit findings

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- package.json pnpm-lock.yaml`
> If the lockfile changed since this plan was written, re-run `pnpm audit`
> first — the findings below may already be partially resolved.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (dev/release tooling only; no runtime dependency changes)
- **Depends on**: none
- **Category**: security / dependencies
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

`pnpm audit` reports 27 advisories (1 critical, 11 high) as of the planning date. **None affect the published package** — the runtime dependencies (`debug`, `filenamify-url`) are clean; everything flagged is in the dev/release chain: `handlebars` (critical + high, pulled in via `semantic-release → conventional-changelog-writer`), `glob`/`minimatch`/`brace-expansion` (direct dev dep + transitive), `esbuild` (via `tsx`), `cross-spawn`, `lodash-es`, `js-yaml`, `picomatch`, `@octokit/*`. These run in CI with repo write tokens (`GITHUB_TOKEN`, `NPM_TOKEN`, `GH_TOKEN_GISTS` — see `.github/workflows/release.yml`), so keeping the release toolchain patched is worth an hour. Most fixes are in-range lockfile refreshes (e.g. handlebars `4.7.8 → 4.7.9`).

## Current state

- `package.json` — dependencies: `debug ^4.3.4`, `filenamify-url 2.1.2` (exact pin). devDependencies include `semantic-release ^24.1.2`, `glob ^11.0.0`, `tsx ^4.19.1`, `typescript ^5.6.2`, `@biomejs/biome ^2.2.5`, `@sebbo2002/semantic-release-jsr ^2.0.1`.
- `pnpm-lock.yaml` — last refreshed well before the planning date; most advisories have in-range patched versions.
- Package manager pinned: `"packageManager": "pnpm@10.15.1"`.
- Release flow: every push runs `.github/workflows/release.yml` → `npm run ci` → `npx semantic-release`. Version fields in `package.json`/`jsr.json` are semantic-release-managed placeholders — do not bump them manually.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Refresh in-range | `pnpm update`     | exit 0, lockfile updated |
| Audit     | `pnpm audit`             | fewer/no advisories |
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Tests     | `pnpm test`              | all pass (needs network pre-plan-001) |
| Lint+format check | `pnpm biome ci`  | exit 0              |
| Build     | `pnpm build`             | exit 0 (writes `lib/` — gitignored? check `git status` after) |

## Scope

**In scope**:
- `pnpm-lock.yaml` (primary)
- `package.json` — only if an advisory requires bumping a *direct devDependency's range*; runtime `dependencies` must not change.

**Out of scope**:
- Major-version upgrades of `semantic-release`, `biome`, or `typescript` — those have config blast radius (release.config.js, biome.json, compile behavior) and are not needed to clear advisories. If an advisory *requires* a major bump, STOP and report.
- `filenamify-url` — the exact `2.1.2` pin is old but unflagged; upgrading to 3.x/4.x is a behavior change (filename output could alter cache filenames). Leave it.
- `tests/runtimes/*/package.json` and their lockfiles.

## Git workflow

- Branch: `advisor/009-devdep-security-updates`
- Commit: `chore(deps): refresh lockfile to clear dev-dependency audit advisories`
- Do NOT push or open a PR unless the operator instructed it. Note: pushing this branch to the repo triggers the release workflow (it runs on every push) — flag that to the operator.

## Steps

### Step 1: Baseline

Run `pnpm audit` and save the summary (count by severity) for your report.

**Verify**: you have the before-count recorded.

### Step 2: In-range refresh

`pnpm update` (no `--latest`). This refreshes transitive deps within existing ranges — expected to fix handlebars, minimatch, brace-expansion, cross-spawn, js-yaml, picomatch, lodash-es, @octokit/* at minimum.

**Verify**: `pnpm audit` → advisory count strictly lower; note what remains.

### Step 3: Targeted direct-dep bumps (only if needed)

For remaining advisories on **direct** devDependencies (likely candidates: `glob`, `tsx` for the esbuild advisory): bump the range in `package.json` to the patched minor/patch version, `pnpm install`, re-audit. Stay within the same major version.

For remaining advisories on **transitive** deps with no in-range fix, use `pnpm.overrides` in `package.json` only for critical/high severity, and list each override in your report (overrides rot; the maintainer should know they exist).

**Verify**: `pnpm audit` → zero critical/high. (Moderate/low leftovers in the release chain are acceptable — list them.)

### Step 4: Confirm nothing broke

Run `pnpm exec tsc --noEmit`, `pnpm biome ci`, `pnpm test`, `pnpm build`.

**Verify**: all exit 0. If `pnpm test` fails for network reasons (plan 001 not yet executed), run the network-free specs at minimum: `node --experimental-vm-modules --test --import tsx src/body.spec.ts src/headers.spec.ts src/store.spec.ts` → pass, and note the limitation in your report.

## Test plan

No new tests — the gates are the audit count and the existing suite/build.

## Done criteria

- [ ] `pnpm audit` reports zero critical and zero high advisories
- [ ] Runtime `dependencies` in `package.json` unchanged (`git diff package.json` shows no changes under `"dependencies"`)
- [ ] `pnpm exec tsc --noEmit`, `pnpm biome ci`, `pnpm build` all exit 0
- [ ] Test suite passes (full, or documented subset per Step 4)
- [ ] Report lists any remaining moderate/low advisories and any `pnpm.overrides` added
- [ ] `plans/README.md` status row updated

## STOP conditions

- An advisory can only be cleared by a **major** bump of semantic-release, biome, typescript, or tsx → stop and report the specific advisory + required bump.
- `pnpm update` changes anything under runtime `dependencies` → revert and investigate before proceeding.
- The build or tests break after the refresh and the cause isn't obvious within two fix attempts.

## Maintenance notes

- This is recurring hygiene; consider (maintainer decision, not this plan) adding Dependabot/Renovate or a scheduled `pnpm audit` CI job.
- Any `pnpm.overrides` added here should be removed once upstream ranges catch up.
