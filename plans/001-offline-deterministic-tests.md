# Plan 001: Make the unit test suite offline, deterministic, and non-destructive

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- src/testUtils.ts src/fetch-cache.spec.ts src/stores/fs.spec.ts src/stores/memory.spec.ts tests/fixtures/http`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

Running `pnpm test` today **deletes the committed cache fixtures** (`src/stores/fs.spec.ts` does `fs.rm("./tests/fixtures/http", { recursive: true })` in a `before()` hook) and then re-fetches everything from live third-party echo servers (`echo.free.beeceptor.com`, `echoserver.dev`, `www.example.com`). Consequences: CI fails whenever a free echo service is down (this already happened — see commits `1fae0aa` and `58f98bf`, "jsontest.com down, use beeceptor.com instead"); every local test run dirties the working tree by rewriting fixtures with new `date` headers; and — ironically for a caching library — the "serve a HIT from a committed fixture" path is never actually tested, because the fixtures are always deleted first. This plan makes the `src/**/*.spec.ts` suite run fully offline with an injected fake `fetch`, and adds a test that proves a HIT is served from a committed fixture without touching the network. It is the verification baseline that plans 002–008 build on.

## Current state

- `src/testUtils.ts` — exports `createTestsForMock(mock)`, a shared test battery used by both store specs. Every test performs a real network fetch on cache miss:
  - line 7: `const url = "https://echo.free.beeceptor.com/?id=test1";`
  - line 16: `const url = "https://echoserver.dev/server?query=..."` (echoes `"hello"` as text)
  - lines 29–96: JSON test, headers-differentiation test, body-differentiation test — all against `echo.free.beeceptor.com`, asserting on the echo server's response shape (`data.parsedQueryParams`, `data.parsedBody`).
- `src/stores/fs.spec.ts` — the destructive hook:
  ```ts
  // src/stores/fs.spec.ts:10-17
  describe("fsStore", () => {
    describe("standard tests", () => {
      before(async () => {
        await fs.rm("./tests/fixtures/http", { force: true, recursive: true });
      });
      createTestsForMock(nodeFsCacheMock);
    });
  });
  ```
- `src/stores/memory.spec.ts` — runs `createTestsForMock` against the memory store (harmless, but network-dependent on miss).
- `src/fetch-cache.spec.ts:26-48` — "should pass options to store methods" really fetches `http://www.example.com/` three times (memory store, so first call per key is a live fetch).
- `src/fetch-cache.ts:83-87` — **the hook that makes this plan easy**: `createFetchCache` already accepts a `fetch` option used as the upstream on cache miss:
  ```ts
  // src/fetch-cache.ts:83-87
  export interface CreateFetchCacheOptions {
    runtime: Runtime;
    Store?: typeof FMCStore | [typeof FMCStore, Record<string, unknown>];
    fetch?: typeof origFetch;
  }
  ```
- `src/stores/fs.ts:34-46` — `FMCFileSystemStore` accepts a `location` option (relative to `cwd`), so tests can point the store at a temp directory. Stores can be passed with options as a tuple: `createFetchCache({ Store: [FsStore, { location: "..." }] })` (see `src/fetch-cache.ts:106-109`).
- `tests/fixtures/http/*.json` — 7 committed fixture files (cache entries with `request` and `response` objects). Currently both test fixtures and test *output*.
- Conventions: tests use `node:test` (`describe`/`test as it`) + `expect` from the `expect` package. Imports use `.js` extensions in TS source. See `src/body.spec.ts` for the house style.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm exec tsc --noEmit` | exit 0, no output   |
| Tests     | `pnpm test`              | all pass (currently requires network — that's what this plan fixes) |
| Lint      | `pnpm lint`              | exit 0              |
| Clean tree check | `git status --porcelain` | empty after a test run |

## Scope

**In scope** (the only files you should modify/create):
- `src/testUtils.ts` — rewrite to use an injected fake upstream fetch
- `src/stores/fs.spec.ts` — temp-dir location, remove the `fs.rm` of committed fixtures, add HIT-from-committed-fixture test
- `src/stores/memory.spec.ts` — pass the fake fetch
- `src/fetch-cache.spec.ts` — pass the fake fetch
- `tests/fixtures/http/` — you may **replace** the committed fixtures with ones generated by the new fake upstream (they become true read-only fixtures)

**Out of scope** (do NOT touch, even though they look related):
- `tests/runtimes/**` — the cross-runtime smoke tests intentionally exercise real installs and are run separately by `pnpm run ci`; leave them alone.
- All production code in `src/*.ts` (non-spec). No production change is needed — the `fetch` injection point already exists.
- `.github/workflows/release.yml`.

## Git workflow

- Branch: `advisor/001-offline-deterministic-tests`
- Conventional commits, matching repo style (e.g. `fix(store): better handling of null body`). Suggested: `test(specs): run offline via injected fetch; stop deleting committed fixtures`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build a fake upstream fetch in `src/testUtils.ts`

Add and export a `fakeFetch` implementation that mimics the subset of echo behavior the tests assert on, with **fixed** headers (no `date`, no random values — determinism is the point):

```ts
export function createFakeFetch() {
  const fn = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    fn.calls++;
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    // /text endpoint returns plain text; everything else echoes JSON
    if (url.pathname === "/text")
      return new Response("hello", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    const body = request.body ? await request.text() : null;
    return new Response(
      JSON.stringify({
        parsedQueryParams: Object.fromEntries(url.searchParams.entries()),
        parsedBody: body ? JSON.parse(body) : undefined,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  fn.calls = 0;
  return fn;
}
```

(Exact shape may vary; what's load-bearing: a call counter, deterministic headers, text and JSON paths, echoing query params and body so the existing assertions keep working.)

Rewrite `createTestsForMock` to accept the mock as today, keep the same five tests and the same MISS/HIT assertions, but change all URLs to a fake host (e.g. `https://fmc.test/…` and `https://fmc.test/text`) so nothing can accidentally hit a real service.

Change the call sites so each spec creates its mock with the fake upstream:
`createFetchCache({ Store: MemoryStore, fetch: createFakeFetch() })`.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 2: Fix `src/stores/fs.spec.ts`

1. Remove the `before(...)` hook that deletes `tests/fixtures/http`.
2. Point the store at a per-run temp directory instead of the committed fixtures, e.g.:
   ```ts
   import os from "node:os";
   import path from "node:path";
   const location = await fs.mkdtemp(path.join(os.tmpdir(), "fmc-test-"));
   const nodeFsCacheMock = createFetchCache({
     Store: [FsStore, { location }],
     fetch: createFakeFetch(),
   });
   ```
   Note: `FsStore` joins `location` onto `cwd` via `runtime.path.join(this._cwd, options.location)` (`src/stores/fs.ts:42-45`); `path.join` with an absolute second segment on POSIX does **not** reset to the absolute path the way `path.resolve` does — check the resulting path in the test (a `console.log` while developing is fine) and if the absolute temp path is mangled, use a relative path under the ignored `coverage/` dir or a `tmp/` dir added to `.gitignore` instead. Do not "fix" `fs.ts` in this plan.
3. MISS/HIT battery runs against the temp dir as before.

**Verify**: `pnpm test` → all pass; `git status --porcelain` → empty (committed fixtures untouched).

### Step 3: Add a HIT-from-committed-fixture test

Regenerate `tests/fixtures/http/` once from the new fake upstream (run a small throwaway script or temporarily point the store there, then commit the results and remove the throwaway). Then add to `src/stores/fs.spec.ts`:

```ts
describe("committed fixtures", () => {
  const mock = createFetchCache({
    Store: FsStore, // default location: tests/fixtures/http
    fetch: async () => {
      throw new Error("network fetch attempted — fixture should have HIT");
    },
  });
  // fetch one of the committed URLs; assert X-FMC-Cache === "HIT"
});
```

This is the first test in the repo that proves the library's core promise: a committed cache serves responses with zero network.

**Verify**: `pnpm test` → all pass including the new test; run it twice back-to-back; `git status --porcelain` → empty both times.

### Step 4: De-network `src/fetch-cache.spec.ts`

In the "should pass options to store methods" test, pass `fetch: createFakeFetch()` to `createFetchCache` and change the URL to the fake host. Assertions are about `fetchContent` call arguments and need no other change.

**Verify**: `pnpm test` → all pass with network disabled if you can arrange it; otherwise grep-based check below.

## Test plan

This plan *is* the test work. Final checks:

- `grep -rn "beeceptor\|echoserver\|example.com" src/` → no matches (all spec URLs now point at the fake host).
- `grep -rn "fs.rm" src/` → no matches.
- `pnpm test` twice in a row → both pass, `git status --porcelain` empty.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0, twice in a row
- [ ] `git status --porcelain` is empty after test runs (fixtures not rewritten)
- [ ] `grep -rn "beeceptor\|echoserver\|example.com" src/` → no matches
- [ ] `grep -rn "fs.rm" src/` → no matches
- [ ] A test exists that asserts `X-FMC-Cache: HIT` from `tests/fixtures/http` with an upstream fetch that throws
- [ ] `pnpm lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `fetch` option on `CreateFetchCacheOptions` doesn't behave as described (i.e. the injected function is not what's called on cache miss) — that would mean `src/fetch-cache.ts` drifted.
- The `path.join` absolute-location issue (Step 2) can't be worked around without editing `src/stores/fs.ts` — report it; the production fix belongs in plan 008's territory, not here.
- Rewriting the fixtures changes their filenames in a way you don't understand (filenames encode method/headers/body hashes — see `src/store.ts:84-137`); don't hand-edit filenames.

## Maintenance notes

- Plans 002–006 and 008 add tests that assume this offline harness exists; their specs should use `createFakeFetch` rather than live URLs.
- Plan 005 (header redaction) will change cache-key hashes for requests with sensitive headers, which changes fixture *filenames* — whoever executes it must regenerate `tests/fixtures/http` via the same mechanism you used in Step 3.
- Reviewer should scrutinize: that the fake echo response shape still matches what the assertions test, and that no spec silently lost coverage in the rewrite (same five behaviors: Request-as-arg, text, JSON, header differentiation, body differentiation — plus the new HIT test).
- Deferred: the cross-runtime tests in `tests/runtimes/` still hit real services; making those hermetic is a separate decision for the maintainer (they exist partly to smoke-test real installs).
