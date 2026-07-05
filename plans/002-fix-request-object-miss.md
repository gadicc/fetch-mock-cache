# Plan 002: On cache miss, send the caller's actual Request (method, headers, body) to the network

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- src/fetch-cache.ts src/testUtils.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-offline-deterministic-tests.md (soft — without it, running the full suite needs network access and rewrites `tests/fixtures/http`)
- **Category**: bug
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

When a caller invokes the mock as `fetch(new Request(url, { method: "POST", headers, body }))` — a `Request` object as the first argument, no second argument — the cache **key** is correctly computed from the Request's method/headers/body, but on a cache miss the **real network request** is issued as `fetch(url, undefined)`: a bare GET with no headers and no body. The wrong response then gets cached under the right key, so the corruption is silent and persistent. The existing test for Request-as-first-argument only uses a GET with no headers, which is why this was never caught.

## Current state

- `src/fetch-cache.ts` — the whole mock implementation lives in `cachingMockImplementation`:

  ```ts
  // src/fetch-cache.ts:127-134
  const fetchRequest =
    typeof urlOrRequest === "string" || urlOrRequest instanceof URL
      ? new Request(urlOrRequest, requestInit)
      : urlOrRequest;

  const url = fetchRequest.url;

  const clonedRequest = fetchRequest.clone();
  ```

  `clonedRequest` is the one whose body gets consumed by `serializeBody` (line 138) when building the cache key. `fetchRequest` itself is never consumed.

  ```ts
  // src/fetch-cache.ts:163-166
  debug("Fetching %o", url);

  const p = fetch(url, requestInit);   // ← the bug: drops fetchRequest entirely
  const response = await p;
  ```

  (`fetch` here is the injected/original upstream fetch from `createCachingMock`'s options, not the global.)

- `src/testUtils.ts:6-12` — the only Request-object test, GET-only:

  ```ts
  it("works with a Request as first argument", async (t) => {
    const url = "https://echo.free.beeceptor.com/?id=test1";
    ...
    const data = await (await fetch(new Request(url))).json();
  ```

  (If plan 001 has landed, URLs will be `https://fmc.test/...` and the upstream will be `createFakeFetch()` — same structure.)

- Conventions: biome formatting (double quotes, semicolons), `node:test` + `expect` for specs, `.js` import specifiers.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Tests     | `pnpm test`              | all pass            |
| Lint      | `pnpm lint`              | exit 0              |

## Scope

**In scope**:
- `src/fetch-cache.ts` (lines ~163–166 only)
- `src/testUtils.ts` (add regression test)

**Out of scope**:
- Header redaction, readCache semantics, body serialization — separate plans (003–005).
- `src/runtimes/*`, `src/stores/*`.
- Merging `requestInit` into the cache key when *both* a Request and an init are passed (see Maintenance notes) — do not attempt it here.

## Git workflow

- Branch: `advisor/002-fix-request-object-miss`
- Commit style: conventional commits, e.g. `fix(fetch-cache): send full Request on cache miss, not bare URL`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Use `fetchRequest` for the real fetch

In `src/fetch-cache.ts`, replace:

```ts
const p = fetch(url, requestInit);
const response = await p;
```

with:

```ts
const response = await fetch(fetchRequest);
```

`fetchRequest`'s body is intact (only `clonedRequest` was consumed for serialization), so this is safe. This makes the network request carry exactly the method/headers/body that the cache key was computed from — for both the string-URL path (where `fetchRequest` was built from `url + requestInit`) and the Request-object path.

**Verify**: `pnpm exec tsc --noEmit` → exit 0; `pnpm test` → all existing tests pass.

### Step 2: Add a regression test

In `src/testUtils.ts`, add to `createTestsForMock` a test that passes a **POST `Request` object with headers and a body** as the sole argument, and asserts the upstream actually received them (via the echoed response — the echo upstream returns `parsedBody`, and if plan 001's `createFakeFetch` is in place you can also echo a request header):

```ts
it("sends method/headers/body on miss when called with a Request object", async (t) => {
  const url = "https://fmc.test/request-object-post"; // or beeceptor sample-request pre-001
  t.mock.method(globalThis, "fetch", mock);
  const body = { hello: "req" };
  const request = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await fetch(request);
  const data = await response.json();
  expect(data.parsedBody).toEqual(body); // fails on the old code: GET with no body
});
```

Before the fix this test fails (echoed `parsedBody` is undefined because the network request went out as a bodiless GET); after the fix it passes. Confirm that ordering: temporarily `git stash` the Step 1 change, run the new test, watch it fail, unstash.

**Verify**: `pnpm test` → all pass, including the new test in both fs and memory store suites.

## Test plan

- New test as in Step 2 (added to the shared `createTestsForMock` battery so it runs against both stores).
- Pattern to follow: the existing "differentiates requests by body" test in `src/testUtils.ts:65-96`.
- Verification: `pnpm test` → all pass; the new test demonstrably fails without the Step 1 change.

## Done criteria

- [ ] `grep -n "fetch(url, requestInit)" src/fetch-cache.ts` → no matches
- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0; new Request-object POST regression test exists and passes
- [ ] `pnpm lint` exits 0
- [ ] No files outside the in-scope list modified (`git status --porcelain`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `fetch(fetchRequest)` throws a `duplex`-related error (undici requires `duplex: "half"` for *stream* bodies; string/buffer bodies are fine). If this appears with a plain string body, something else is wrong — report rather than adding `duplex` options ad hoc.
- Any *existing* test changes MISS/HIT behavior after Step 1 (cache keys must be unaffected — this plan changes only the outbound network call).
- The code at lines 163–166 doesn't match the excerpt above.

## Maintenance notes

- Known remaining edge (deliberately out of scope): `fetch(requestObject, requestInit)` with **both** arguments ignores `requestInit` when computing the cache key *and* (after this fix) when sending. The fetch spec merges init over the Request. If anyone reports it, the fix is to always construct `new Request(urlOrRequest, requestInit)` — but that has body/duplex subtleties, so it was deferred.
- Reviewer should scrutinize: that `fetchRequest` cannot have been consumed before line ~165 (today only `clonedRequest` is consumed; keep it that way).
