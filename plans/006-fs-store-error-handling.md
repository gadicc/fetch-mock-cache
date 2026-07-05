# Plan 006: fs store — only treat "file not found" as a cache miss

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- src/stores/fs.ts src/stores/fs.spec.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-offline-deterministic-tests.md (soft — offline test harness)
- **Category**: bug
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

`FMCFileSystemStore.fetchContent` catches **every** error and returns `null` (= cache miss). A corrupted or truncated cache file, a permissions error, or invalid JSON all silently degrade to "not cached", triggering a fresh network fetch — and, worse, an overwrite of the file that might have told you what went wrong. For a debugging-oriented tool this is exactly backwards: only "file does not exist" is a legitimate miss; everything else should surface loudly.

## Current state

- `src/stores/fs.ts`:

  ```ts
  // src/stores/fs.ts:75-86
  override async fetchContent(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<FMCCacheContent | null> {
    const path = await this.pathFromRequest(request, options);
    try {
      const content = await this.runtime.fs.readFile(path);
      return JSON.parse(content) as FMCCacheContent;
    } catch (_error) {
      return null;
    }
  }
  ```

- The `readFile` implementations differ per runtime, and so do their not-found errors:
  - Node (`src/runtimes/node.ts:29`): `fs.promises.readFile` rejects with an error whose `.code === "ENOENT"`. Bun reuses this runtime (`src/runtimes/bun.ts:12`).
  - Deno (`src/runtimes/deno.ts:30-36`): `Deno.readFile` rejects with `Deno.errors.NotFound`, whose `.name === "NotFound"` (no `.code` property).

- Conventions: plain `Error` throws with descriptive messages (see `src/fetch-cache.ts:100-102`, `src/store.ts:106`); biome formatting.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Tests     | `pnpm test`              | all pass            |
| Lint      | `pnpm lint`              | exit 0              |

## Scope

**In scope**:
- `src/stores/fs.ts` (`fetchContent` only)
- `src/stores/fs.spec.ts` (new tests)

**Out of scope**:
- `src/runtimes/*` — do not normalize errors at the runtime layer (tempting, but it widens the change surface; the store-level check below covers all three runtimes).
- `storeContent` and the `cache_dir` race — plan 008's territory.

## Git workflow

- Branch: `advisor/006-fs-store-error-handling`
- Commit: `fix(stores/fs): only treat missing file as cache miss; surface corrupt cache files`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Narrow the catch

Replace the catch-all in `fetchContent`:

```ts
override async fetchContent(
  request: FMCCacheContent["request"],
  options?: FetchCacheOptions,
): Promise<FMCCacheContent | null> {
  const path = await this.pathFromRequest(request, options);
  let content: string;
  try {
    content = await this.runtime.fs.readFile(path);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  try {
    return JSON.parse(content) as FMCCacheContent;
  } catch (error) {
    throw new Error(
      `fetch-mock-cache: cache file exists but is not valid JSON: ${path} (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }
}
```

with a small module-local helper:

```ts
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("code" in error && error.code === "ENOENT") || // node, bun
      ("name" in error && error.name === "NotFound")) // deno
  );
}
```

**Verify**: `pnpm exec tsc --noEmit` → exit 0; `pnpm test` → all pass (missing-file behavior unchanged).

### Step 2: Tests

In `src/stores/fs.spec.ts`, add a `describe("error handling")` block using a store pointed at a temp dir (reuse plan 001's setup if present):

1. **Missing file → null**: call `store.fetchContent({ url: "https://fmc.test/nope" })` directly (get the store via `fetchCache._store`) → resolves `null`.
2. **Corrupt file → throws**: write `"{ not json"` to the exact path from `store.pathFromRequest(request)`, then `await expect(store.fetchContent(request)).rejects.toThrow(/not valid JSON/)`.

**Verify**: `pnpm test` → all pass including the 2 new tests.

## Test plan

As Step 2; pattern after the direct-store-poking style in `src/fetch-cache.spec.ts:30-31` (accessing `fetchCache._store`).

## Done criteria

- [ ] `grep -n "catch (_error)" src/stores/fs.ts` → no matches
- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0; both new tests pass
- [ ] `pnpm lint` exits 0
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `fetchContent` at `src/stores/fs.ts:75-86` doesn't match the excerpt (drift).
- The Deno runtime test path is exercised in your environment and `NotFound` detection fails — report the actual error shape rather than loosening `isNotFound` to a catch-all.

## Maintenance notes

- If a future store adds another runtime (e.g. browser/OPFS), its not-found error shape must be added to `isNotFound` — reviewer should note this coupling.
- The cross-runtime smoke tests (`tests/runtimes/`, run by `pnpm run ci`) are the only automated coverage for the Deno branch of `isNotFound`; a full `ci` run is worth doing before release.
