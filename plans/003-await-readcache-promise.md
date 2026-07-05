# Plan 003: Await promise-valued `readCache` options

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- src/fetch-cache.ts src/fetch-cache.spec.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-offline-deterministic-tests.md (soft — needed for offline test runs)
- **Category**: bug
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

The public `once()` API documents that `readCache` may be "a boolean, a promise, or a function" (README "Manually controlling cache behaviour" section, and the TSDoc on `FetchCacheOptions`). The implementation awaits the *function* form but never awaits a raw *promise*: a `Promise` object is truthy, so `fetchCache.once({ readCache: Promise.resolve(false) })` behaves as `readCache: true` — the cache is read when the caller explicitly asked to skip it. `writeCache` handles the promise form correctly, making the asymmetry an obvious oversight rather than a design choice. This breaks the documented "rewrite the cache only for failing tests" pattern for anyone who passes a promise for `readCache`.

## Current state

- `src/fetch-cache.ts` — option resolution:

  ```ts
  // src/fetch-cache.ts:124-125
  let readCache = "readCache" in options ? options.readCache : true;
  let writeCache = "writeCache" in options ? options.writeCache : true;
  ```

  ```ts
  // src/fetch-cache.ts:145-150
  if (typeof readCache === "function") {
    readCache = await readCache(cacheContentRequest, options);
  }

  const existingContent =
    readCache && (await store.fetchContent(cacheContentRequest, options));
  ```

  A promise-valued `readCache` falls through the `typeof === "function"` check and is used directly in the `readCache && ...` expression — always truthy.

- For contrast, the `writeCache` promise handling that already works: `src/fetch-cache.ts:179-196` (`if (writeCache instanceof Promise) { writeCache.then(...) }`).

- The type (`src/fetch-cache.ts:42-45`):

  ```ts
  readCache?:
    | boolean
    | Promise<boolean>
    | ((...args: Parameters<FMCStore["fetchContent"]>) => Promise<boolean>);
  ```

- Test conventions: `node:test` + `expect`; see `src/fetch-cache.spec.ts` for the pattern of creating a fetchCache with `MemoryStore` and mocking `globalThis.fetch`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Tests     | `pnpm test`              | all pass            |
| Lint      | `pnpm lint`              | exit 0              |

## Scope

**In scope**:
- `src/fetch-cache.ts` (the `readCache` resolution, lines ~145–150)
- `src/fetch-cache.spec.ts` (new tests)

**Out of scope**:
- Refactoring the `writeCache` fire-and-forget promise path (documented behavior: the write intentionally happens after the response is returned).
- README changes.

## Git workflow

- Branch: `advisor/003-await-readcache-promise`
- Commit: `fix(fetch-cache): await promise-valued readCache option`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Resolve the promise form

Change the `readCache` resolution in `src/fetch-cache.ts` to:

```ts
if (typeof readCache === "function") {
  readCache = await readCache(cacheContentRequest, options);
} else if (readCache instanceof Promise) {
  readCache = await readCache;
}
```

(Do not blanket-`await` a boolean — keep the explicit branches so the code reads the same way as the `writeCache` handling below it.)

**Verify**: `pnpm exec tsc --noEmit` → exit 0. TypeScript should also stop narrowing complaints, since after these branches `readCache` is `boolean`.

### Step 2: Add regression tests

In `src/fetch-cache.spec.ts`, add a `describe("readCache option")` block. Use a `MemoryStore`-backed fetchCache with a counting upstream fetch (post-001: `createFakeFetch()` from `./testUtils.js`; pre-001: a local `async () => new Response("x")` stub with a counter). Cases:

1. **Promise resolving false skips the cache**: prime the cache (one fetch), then `fetchCache.once({ readCache: Promise.resolve(false) })` and fetch the same URL → upstream counter increments (network was used) and response header `X-FMC-Cache` is `MISS`.
2. **Promise resolving true uses the cache**: prime, then `once({ readCache: Promise.resolve(true) })` → counter unchanged, header `HIT`.
3. **Boolean false still works** (guards against regression): `once({ readCache: false })` → `MISS`.

Case 1 must fail before Step 1's change (run it against stashed code to confirm) and pass after.

**Verify**: `pnpm test` → all pass including 3 new tests.

## Test plan

- Tests as in Step 2, in `src/fetch-cache.spec.ts`, modeled on the existing "should pass options to store methods" test (same file, lines 26–48).
- Verification: `pnpm test` → exit 0.

## Done criteria

- [ ] `grep -n "readCache instanceof Promise" src/fetch-cache.ts` → 1 match
- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0; the three new readCache tests exist and pass
- [ ] `pnpm lint` exits 0
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The excerpted code at `src/fetch-cache.ts:145-150` doesn't match (drift).
- Existing tests fail after the change — awaiting a resolved promise should be behaviorally invisible to every current caller; a failure means something unexpected depends on the broken behavior.

## Maintenance notes

- Plan 011 (cache-modes design spike) builds on `readCache`/`writeCache` as primitives; it assumes both forms (function/promise/boolean) work symmetrically after this plan.
- Reviewer should check the fix keeps the function form's arguments `(cacheContentRequest, options)` untouched — user code may depend on them.
