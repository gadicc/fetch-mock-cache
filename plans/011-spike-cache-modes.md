# Plan 011: Design spike — first-class cache modes (record / replay / auto / off)

> **Executor instructions**: This is a **design spike, not a build plan**. The
> deliverable is a design document plus a possibly-throwaway prototype — no
> production code lands from this plan. Follow the investigation steps; if a
> STOP condition occurs, stop and report. When done, update the status row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- src/fetch-cache.ts src/runtimes README.md`
> The primitives this spike builds on (`readCache`/`writeCache`, `Runtime.env`)
> must still exist as described below.

## Status

- **Priority**: P3
- **Effort**: M (coarse — spikes are hard to estimate)
- **Risk**: LOW (no production changes)
- **Depends on**: plans/003-await-readcache-promise.md (the primitives must work symmetrically before designing on top of them)
- **Category**: direction
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

Evidence from the repo says users want run-level control over caching, and today they must hand-roll it:

1. The README's "Tips & Tricks" section walks users through ~50 lines of wrapper code to get "re-record the cache for failing tests" behavior, driven by an env var (`FETCH_CACHE === "recache"`). Friction the library documents is friction the library should absorb.
2. The per-call primitives already exist (`once({ readCache, writeCache })` — `src/fetch-cache.ts:36-57`) but there is **no global/default options mechanism** — the code even has a `// TODO, main options?  merge?` comment at `src/fetch-cache.ts:118`.
3. `Runtime.env` is declared in the `Runtime` interface (`src/fetch-cache.ts:16`) and populated by all three runtimes (`node.ts:18`, `deno.ts:19`, bun via node) — yet **nothing reads it**. It looks provisioned for exactly this feature (env-driven mode switching) and never built.
4. Prior art users will expect: VCR's `record` modes, nock-back's `wild/dryrun/record/lockdown`, Polly.js's `record/replay/passthrough/stale`.

## Deliverable

A design document at `plans/011-cache-modes-DESIGN.md` containing:

1. **Mode semantics table** — proposed modes expressed purely as combinations of the existing primitives, e.g.:

   | Mode | readCache | writeCache | on miss | intended use |
   |------|-----------|------------|---------|--------------|
   | `auto` (today's behavior, default) | true | true | fetch + cache | everyday |
   | `replay` | true | — | **throw** | CI: no network ever |
   | `record` | false | true | fetch + cache | refresh fixtures |
   | `off` | false | false | fetch | debugging the mock itself |

   Note `replay`'s "throw on miss" is NOT expressible with today's primitives — the design must specify this new behavior (likely the real value of the feature for CI).

2. **API surface proposal**:
   - Where the default options live: `createFetchCache({ Store, mode })` and/or a settable `fetchCache.options = {}` — resolve the `TODO, main options? merge?` question: define precedence `once() > global option > env var > built-in default`.
   - Env var name and reading mechanism (this is what `Runtime.env` exists for — e.g. `FMC_CACHE_MODE=replay pnpm test`). Decide the name, case-insensitivity, and invalid-value behavior.
   - Whether "recache failing tests" (the README pattern) becomes a mode or stays a recipe — recommend, with reasoning.

3. **Compatibility analysis**: default must stay `auto` (yahoo-finance2 and other users depend on current behavior); interaction with `once()` overrides; what `replay`'s miss-error should look like (message must name the store, the computed cache id, and the env var to fix it).

4. **Open questions list** for the maintainer (e.g.: should `replay` also fail on *unused* fixtures? should mode be settable per-store rather than per-fetchCache?).

5. **Effort estimate** for the build plan that would follow.

## Investigation steps

### Step 1: Survey prior art (≤1 hour)

Read the mode semantics of nock-back, Polly.js, and Ruby VCR (docs only). Record in the design doc: the mode names users already know, and which semantics they'll expect.

### Step 2: Map primitives

Read `src/fetch-cache.ts` fully. Confirm the table in Deliverable 1 against actual code paths (the `existingContent` branch at ~line 149, the `writeCache` branch at ~line 179). Identify exactly where a "throw on miss" check would slot in.

### Step 3: Prototype (throwaway, ≤2 hours)

In a scratch branch, hack a minimal `mode` option + env-var read into `createCachingMock` and one spec exercising `replay` throwing on a miss. The goal is to validate the precedence design and find surprises (e.g. `Runtime.env` is snapshotted at module load in `node.ts:18` — `{ ...process.env }` — so env changes after import are invisible; the design doc must address whether that's acceptable). **Delete or clearly mark the branch; nothing merges.**

### Step 4: Write the design doc

Produce `plans/011-cache-modes-DESIGN.md` per the Deliverable spec.

## Scope

**In scope**: `plans/011-cache-modes-DESIGN.md`; a throwaway prototype branch.

**Out of scope**: ANY change to `src/` on the main/dev branch; README changes; building the feature.

## Done criteria

- [ ] `plans/011-cache-modes-DESIGN.md` exists and contains all five deliverable sections
- [ ] The mode table is verified against actual `src/fetch-cache.ts` code paths (cite line numbers)
- [ ] The `Runtime.env` snapshot issue is addressed in the doc
- [ ] No changes to `src/` on the working branch (`git status --porcelain` clean apart from the plans file)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `readCache`/`writeCache` primitives have been removed or redesigned since planning (drift).
- Prototype reveals the primitives can't express the modes without deep refactoring — report that finding; it changes the build-plan effort estimate materially and the maintainer should weigh in before more design work.

## Maintenance notes

- If accepted, the build plan should also *replace* the README "Tips & Tricks" hand-rolled recipe with the productized mode — that recipe is the feature's best marketing.
- Plan 012 (browser spike) interacts: a browser runtime has no `process.env`; the env-var mechanism must degrade gracefully (another reason `Runtime.env` is the right abstraction).
