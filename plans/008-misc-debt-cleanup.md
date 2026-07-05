# Plan 008: Small correctness/debt cleanups (deno runtime name, header types, HIT mutation, mkdir race, dead code)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- src/runtimes/deno.ts src/headers.ts src/fetch-cache.ts src/stores/fs.ts src/store.ts src/body.ts`
> Line numbers below assume commit `16ce139`; plans 002/003/005 shift
> `src/fetch-cache.ts` slightly — match on code shape, and treat any item
> whose excerpt can't be found at all as a STOP condition for that item.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-offline-deterministic-tests.md (soft); best executed AFTER 002–006 to avoid merge noise
- **Category**: tech-debt
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

Five small, independent defects that aren't worth individual plans but collectively mislead readers and set traps: a copy-pasted wrong runtime name, a return type that lies about `set-cookie` arrays, a cache-HIT path that mutates the store's own cached object, a check-then-act race on directory creation, and dead commented-out code. Each item below is independently verifiable; do them as separate commits.

## Current state / Steps

Conventions: biome (double quotes, semicolons), `.js` import specifiers, `pnpm lint` must stay clean.

### Item A: Deno runtime says its name is "node"

```ts
// src/runtimes/deno.ts:15-16
export const runtime: Runtime = {
  name: "node",
```

**Do**: change to `name: "deno"`. (`runtime.name` has no current consumers — `grep -rn "runtime.name\|\.name" src` to confirm — so this is safe.)

**Verify**: `grep -n 'name: "deno"' src/runtimes/deno.ts` → 1 match; `pnpm exec tsc --noEmit` → exit 0.

### Item B: `serializeHeaders` return type is wrong

```ts
// src/headers.ts:13-19
export function serializeHeaders(headers: Headers): Record<string, string> {
  const serialized = Object.fromEntries(headers.entries());
  if (serialized["set-cookie"]) {
    if (typeof headers.getSetCookie === "function") {
      // @ts-expect-error: no type guard for typeof === "function"
      serialized["set-cookie"] = headers.getSetCookie();
```

The function can return `string[]` under `set-cookie` but declares `Record<string, string>`; the mismatch is hidden by `@ts-expect-error` comments. The cache content type is already honest (`FMCCacheContent`'s headers are `Record<string, string | string[]>`, `src/cache.ts:6,13`).

**Do**: change the return type to `Record<string, string | string[]>`, type `serialized` accordingly, and remove whichever `@ts-expect-error` comments become unnecessary (the one for `headers.raw` on node-fetch at lines 21–24 likely must stay — `raw` isn't in the standard `Headers` type). If plan 005 landed, `redactHeaders` in the same file already uses the honest type; align them.

**Verify**: `pnpm exec tsc --noEmit` → exit 0 (`@ts-expect-error` on a line with no error fails the build, so tsc itself confirms you removed the right ones); `pnpm test` → headers specs pass.

### Item C: Cache HIT mutates the stored content object

```ts
// src/fetch-cache.ts:152-160
if (existingContent) {
  debug("Using cached copy of %o", url);
  existingContent.response.headers["X-FMC-Cache"] = "HIT";

  return new Response(await deserializeBody(existingContent.response), {
    ...
    headers: deserializeHeaders(existingContent.response.headers),
  });
```

With the memory store, `existingContent` IS the stored object — the mock permanently injects an `X-FMC-Cache: HIT` header into the store's cached content. Any store that re-persists content would leak the marker to disk.

**Do**: build the Headers first, then set the marker on the copy:

```ts
const headers = deserializeHeaders(existingContent.response.headers);
headers.set("X-FMC-Cache", "HIT");
return new Response(await deserializeBody(existingContent.response), {
  status: existingContent.response.status,
  statusText: existingContent.response.statusText,
  headers,
});
```

(This mirrors how the MISS path already does it — `src/fetch-cache.ts:198-199`.)

**Do also (test)**: in `src/fetch-cache.spec.ts`, after a MISS+HIT cycle against a `MemoryStore`, assert the stored content has no `X-FMC-Cache` key (inspect via `fetchCache._store`).

**Verify**: `pnpm test` → all pass including the new assertion; HIT header still returned to callers (existing testUtils tests cover this).

### Item D: `cache_dir` check-then-act race

```ts
// src/stores/fs.ts:49-55
async cache_dir(filename: string): Promise<string> {
  if (!this._createdCacheDir) {
    this._createdCacheDir = true;
    await this.runtime.fs.mkdir(this._location, { recursive: true });
  }
  return this.runtime.path.join(this._location, filename);
}
```

A second concurrent call sees the flag already `true` and returns a path while the first call's `mkdir` is still in flight → `writeFile` can hit ENOENT. Real apps fire parallel fetches in tests routinely.

**Do**: store the promise instead of a boolean:

```ts
_mkdirPromise?: Promise<unknown>;

async cache_dir(filename: string): Promise<string> {
  if (!this._mkdirPromise)
    this._mkdirPromise = this.runtime.fs.mkdir(this._location, {
      recursive: true,
    });
  await this._mkdirPromise;
  return this.runtime.path.join(this._location, filename);
}
```

Remove the now-unused `_createdCacheDir` field (declared at `src/stores/fs.ts:30`).

**Verify**: `pnpm exec tsc --noEmit` → exit 0; `pnpm test` → fs store tests pass; `grep -n "_createdCacheDir" src` → no matches.

### Item E: Dead code

- `src/store.ts:45` (`// fetchCache?: FetchCache;`) and `src/store.ts:51-60` (commented-out `setFetchCache` block) — delete.
- `src/fetch-cache.ts:224` (`// store.setFetchCache(fetchCache);`) — delete.
- `src/body.ts:42-44` — the unused `_nosniff` variable; keep the intent as a comment if you like, but delete the dead assignment:
  ```ts
  const _nosniff =
    response.headers.get("x-content-type-options")?.toLowerCase() === "nosniff";
  ```
- `src/fetch-cache.spec.ts:5` (`// import FsStore from "./stores/nodeFs.js";` — a path that no longer exists) — delete.

**Verify**: `grep -rn "setFetchCache\|_nosniff\|nodeFs" src/` → no matches; `pnpm test` → all pass; `pnpm lint` → exit 0.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Tests     | `pnpm test`              | all pass            |
| Lint      | `pnpm lint`              | exit 0              |

## Scope

**In scope**: `src/runtimes/deno.ts`, `src/headers.ts`, `src/fetch-cache.ts` (HIT block + one dead comment), `src/stores/fs.ts` (`cache_dir` + field), `src/store.ts` (dead code), `src/body.ts` (`_nosniff`), `src/fetch-cache.spec.ts` (dead import + Item C test).

**Out of scope**:
- `Runtime.env` (populated but unused on all runtimes) — deliberately KEPT: the cache-modes design spike (plan 011) is expected to use it. Do not remove.
- Anything touching cache-key computation or serialization formats.

## Git workflow

- Branch: `advisor/008-misc-debt-cleanup`
- One commit per item, conventional style: `fix(runtimes/deno): correct runtime name`, `fix(headers): honest serializeHeaders return type`, `fix(fetch-cache): don't mutate stored content on HIT`, `fix(stores/fs): make cache-dir creation race-safe`, `chore: remove dead code`
- Do NOT push or open a PR unless the operator instructed it.

## Test plan

- Item C gets an explicit new test (store content uncontaminated after HIT).
- Items A/B/D/E are covered by types + existing suite; the greps in each item are the gates.

## Done criteria

- [ ] All five per-item verifications pass
- [ ] `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm lint` all exit 0
- [ ] `git status --porcelain` shows only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any item's excerpt can't be located (drift) → skip that item, note it in your report, continue with the rest.
- Item B snowballs (removing the type lie surfaces type errors outside `src/headers.ts`) → stop that item and report; don't chase casts through the codebase.

## Maintenance notes

- Item D's promise-caching pattern must be kept if anyone adds cache-dir invalidation.
- Reviewer: Item C is the only behavioral change; confirm callers still observe `X-FMC-Cache: HIT`.
