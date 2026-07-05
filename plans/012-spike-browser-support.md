# Plan 012: Design spike — browser / jsdom runtime support

> **Executor instructions**: This is a **design spike, not a build plan**. The
> deliverable is a short design document — no production code lands from this
> plan. Follow the investigation steps; if a STOP condition occurs, stop and
> report. When done, update the status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- src/fetch-cache.ts src/runtimes src/stores`
> The `Runtime` interface and store layout described below must still match.

## Status

- **Priority**: P3
- **Effort**: S (the spike; the build would be M)
- **Risk**: LOW (no production changes)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

Stated-but-undelivered: the README's TODO list has carried "Browser-environment support. Please open an issue if you need this, and in what cases. jsdom?" (README.md:357) — a standing invitation with no corresponding code. The architecture makes this structurally cheap to explore: all runtime-specific behavior is already isolated behind the `Runtime` interface (`src/fetch-cache.ts:14-30`: `env`, `sha256`, `fs`, `path`, `cwd`), and the memory store has no filesystem dependency at all. The open questions are which environments actually matter (jsdom-in-jest vs. real browser test runners like Playwright component tests / vitest browser mode), and what a persistent store looks like without `fs`. Demand is unproven — hence a spike, not a build.

## Deliverable

A design document at `plans/012-browser-support-DESIGN.md` containing:

1. **Demand check**: search the GitHub repo's issues (`gh issue list --repo gadicc/fetch-mock-cache --state all --search browser`, plus "jsdom", "vitest browser", "playwright") and note any requests. Also check whether `jest-fetch-mock-cache` (v1, the predecessor) had browser-related issues. If demand is zero, say so — the recommendation may legitimately be "leave the TODO in place".

2. **Environment matrix** — for each target, what breaks today and what's needed:
   - **jsdom under jest/vitest (node process)**: `node:crypto`, `fs`, `process` all actually available — does the existing node runtime already work? (Likely yes; the spike should *test* this: a jsdom-environment jest test using the node runtime + fs store.) If it works, browser support may be mostly a documentation problem.
   - **Real browser (vitest browser mode, Playwright CT)**: no `fs`/`cwd`/`process`. Needs: a `Runtime` with `crypto.subtle`-based sha256 (already portable — see `src/runtimes/deno.ts:20-28`, which uses only web-standard APIs), stub `path.join`, `env` from... what? (interacts with plan 011's env-var design), and a non-fs store.
   - **Service-worker / MSW-style interception**: out of scope, but note the boundary.

3. **Store options for browsers**: memory store (works today, no persistence — is that enough for browser tests?); an OPFS/IndexedDB store (persistence within a browser profile — useful?); an HTTP-backed store (dev server serves/accepts fixtures — most faithful to the "commit fixtures to the repo" workflow but needs a server component). Recommend one, with reasoning about the committed-fixtures workflow being the library's core value.

4. **Packaging implications**: `src/index.ts` default-exports the node runtime; a browser entry point needs an exports-map entry in BOTH `package.json` and `jsr.json` (dual-publish lockstep rule), and possibly a `browser` condition. One paragraph.

5. **Recommendation + effort estimate**: build / don't-build-yet / docs-only, with a coarse estimate for whichever build is recommended.

## Investigation steps

### Step 1: Demand check (≤30 min)

Run the `gh issue list` searches above; skim results. Record findings.

### Step 2: jsdom experiment (≤1 hour)

In a scratch directory (not the repo), scaffold a minimal jest+jsdom (or vitest+jsdom) project depending on the published `fetch-mock-cache`, and run the README Quick Start test under the jsdom environment. Record: does it work as-is? What errors appear? (Likely issues: jsdom lacks `fetch` until recent versions; jest module resolution of ESM.) This single experiment probably decides the whole recommendation.

### Step 3: Runtime-interface audit (≤30 min)

Read `src/fetch-cache.ts:14-30` and each runtime. List exactly which `Runtime` members a pure-browser implementation can/can't satisfy, and which stores call which members (`grep -n "runtime\." src/stores/*.ts src/store.ts`).

### Step 4: Write the design doc

Produce `plans/012-browser-support-DESIGN.md` per the Deliverable spec.

## Scope

**In scope**: `plans/012-browser-support-DESIGN.md`; scratch experiment outside the repo.

**Out of scope**: ANY change to `src/`; new runtime or store implementations; README changes.

## Done criteria

- [ ] `plans/012-browser-support-DESIGN.md` exists with all five sections
- [ ] The jsdom experiment was actually run and its outcome (works / fails how) is recorded verbatim
- [ ] Issue-search results are recorded (including "none found", if so)
- [ ] `git status --porcelain` clean apart from the plans file
- [ ] `plans/README.md` status row updated

## STOP conditions

- No `gh` auth / no network for the demand check → do the technical sections anyway and mark the demand section as blocked.
- The jsdom experiment hits environment problems unrelated to this library (jest ESM config quicksand) for more than ~1 hour → record what was attempted and move on; don't sink the spike into jest configuration.

## Maintenance notes

- Interacts with plan 011: a browser runtime's `env` source (no `process.env`) should be considered in the cache-modes env-var design.
- If the recommendation is "docs-only" (node runtime already works under jsdom), the follow-up is a README section + maybe a `tests/runtimes/jsdom` smoke test, not a new runtime.
