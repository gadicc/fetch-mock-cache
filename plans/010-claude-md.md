# Plan 010: Author a CLAUDE.md capturing this repo's non-obvious rules

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `ls CLAUDE.md AGENTS.md 2>/dev/null` — if either
> exists, STOP (someone wrote one since planning). Also check
> `plans/README.md` for the status of plans 001/005 — the "Testing" section
> content depends on whether 001 has landed.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but reflects plan 001's status — see below)
- **Category**: dx
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

This repo has several traps that cost any new contributor — human or agent — real time, and one that's destructive: as of the planning commit, **running `pnpm test` deletes `tests/fixtures/http` and hits live third-party servers** (until plan 001 lands). Other non-obvious rules: version fields are semantic-release placeholders (never bump manually); the package dual-publishes to npm and JSR, so `package.json#exports` and `jsr.json#exports` must be edited in lockstep; every push to GitHub triggers the release workflow. A CLAUDE.md makes all subsequent plan executions (and future sessions) cheaper and safer.

## Current state

- No `CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md` exists.
- Facts to encode (verified at commit `16ce139`):
  - **What this is**: `fetch-mock-cache` — a caching mock `fetch` for tests; first call hits the network and caches, later calls replay. Published to npm as `fetch-mock-cache` and to JSR as `@gadicc/fetch-mock-cache`.
  - **Layout**: `src/fetch-cache.ts` (core mock factory), `src/store.ts` (abstract store + cache-key logic), `src/stores/{fs,memory}.ts`, `src/runtimes/{node,bun,deno}.ts` (runtime abstraction: `env`, `sha256`, `fs`, `path`, `cwd`; bun reuses node's), `src/body.ts` / `src/headers.ts` (serialization), `src/testUtils.ts` (shared spec battery), `tests/fixtures/http/` (committed cache fixtures), `tests/runtimes/` (cross-runtime smoke tests, run via `pnpm run ci`, hit real networks).
  - **Commands**: `pnpm test` (node:test via tsx), `pnpm lint` (biome), `pnpm format`, `pnpm build` (tsc → `lib/`), `pnpm exec tsc --noEmit` (typecheck), `pnpm run ci` (full: typecheck + biome ci + coverage + runtime tests).
  - **Testing gotchas**: pre-plan-001 destructive/network behavior (or, post-001: specs run offline via injected `createFakeFetch`; never point specs at live URLs; `tests/fixtures/http` is read-only test input — regenerate only deliberately).
  - **Releases**: semantic-release from conventional commits on every push (`.github/workflows/release.yml`); `version` in `package.json` (`0.0.1`) and `jsr.json` (`1.0.0`) are placeholders — never edit; a `feat!:`/`BREAKING CHANGE:` commit causes a major release.
  - **Dual publish rule**: any new public module needs matching entries in `package.json#exports` (pointing at `lib/*.js`) AND `jsr.json#exports` (pointing at `src/*.ts`), each with the `.js`/`.ts` alias variants both files already demonstrate.
  - **Code style**: biome-enforced (double quotes, semicolons); ESM-only with `.js` specifiers in TS imports; `node:test` + `expect` for specs; TSDoc on exported symbols; experimental APIs prefixed `_` and exempt from semver (README "Internal and Experimental Features").
  - **Deno compatibility**: `src/runtimes/deno.ts` uses `@ts-ignore` for `Deno` globals so plain `tsc` still passes — don't "fix" those.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Verify facts | the commands listed above, spot-checked | as described |

## Scope

**In scope**: create `CLAUDE.md` (repo root). Nothing else.

**Out of scope**: README changes; `.claude/` directory contents; adding a CONTRIBUTING.md.

## Git workflow

- Branch: `advisor/010-claude-md`
- Commit: `docs: add CLAUDE.md with repo conventions and gotchas`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the facts

Spot-check each bullet in "Current state" against the live repo (especially: does `src/stores/fs.spec.ts` still contain `fs.rm` — i.e. has plan 001 landed?). Write the Testing section to match reality at execution time.

**Verify**: each claim you write has a file you looked at.

### Step 2: Write `CLAUDE.md`

Keep it under ~80 lines — commands first, then the gotchas, then style. Suggested headings: `# fetch-mock-cache`, `## Commands`, `## Testing gotchas`, `## Releases & versioning (semantic-release)`, `## Dual npm + JSR publish`, `## Code style`, `## Architecture map`. Terse bullets, no prose padding, no duplicating what README already tells *users* — this file is for people/agents *changing the code*.

**Verify**: `wc -l CLAUDE.md` → ≤ ~100; every command listed actually runs (`pnpm lint` at minimum).

## Test plan

Not applicable (docs). The gate is fact-verification in Step 1.

## Done criteria

- [ ] `CLAUDE.md` exists at repo root with the sections above
- [ ] Every command in it verified runnable
- [ ] Testing section matches the *current* state of plan 001 (destructive-network warning present if 001 not yet DONE)
- [ ] `git status --porcelain` shows only `CLAUDE.md` (+ `plans/README.md` update)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `CLAUDE.md` or `AGENTS.md` already exists.
- A fact in "Current state" contradicts the live repo and you can't resolve which is right by reading the code — report the discrepancy.

## Maintenance notes

- Whoever executes plan 001 (or 005) after this should update the Testing section accordingly — add a line in CLAUDE.md's Testing section reminding of that if 001 is still TODO.
