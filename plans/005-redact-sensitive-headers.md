# Plan 005: Redact sensitive headers before they reach the cache (which users commit to git)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- src/fetch-cache.ts src/headers.ts src/headers.spec.ts tests/fixtures/http README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (changes cache-key hashes for requests carrying sensitive headers — one-time cache invalidation for affected users)
- **Depends on**: plans/001-offline-deterministic-tests.md (fixture regeneration mechanism + offline verification)
- **Category**: security
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

The library's core workflow — stated in the README ("Commit `tests/fixtures/http` (default) to your repo") — is to commit cache files to source control. Those files currently contain **every request header verbatim** (confirmed: committed fixtures in this repo store request headers as-is) and every response header including `set-cookie`. Any user whose tests call an authenticated API (`Authorization: Bearer …`, `Cookie: session=…`, `X-Api-Key: …`) will commit live credentials to their repository by following the documented workflow. This plan makes the mock redact a default list of sensitive headers before hashing and before storage, with an explicit opt-out.

A deliberate design consequence: because the cache **key** hashes the serialized (post-redaction) headers, cache IDs become stable across differing secret values — CI without the real token replays fixtures recorded with it. The cost: existing cache entries for requests that carried sensitive headers get new IDs (one-time re-record). This trade-off is intended; document it.

## Current state

- `src/fetch-cache.ts` — request headers enter the cache content (and therefore the key hash) here:

  ```ts
  // src/fetch-cache.ts:135-143
  const cacheContentRequest: FMCCacheContent["request"] = {
    url,
    method: fetchRequest.method,
    ...(clonedRequest.body && (await serializeBody(clonedRequest))),
    ...(Array.from(fetchRequest.headers.keys()).length > 0 && {
      // Not really necessary as set-cookie never appears in the REQUEST headers.
      headers: serializeHeaders(fetchRequest.headers),
    }),
  };
  ```

  Response headers enter here:

  ```ts
  // src/fetch-cache.ts:168-177
  const newContent: FMCCacheContent = {
    request: cacheContentRequest,
    response: {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: serializeHeaders(response.headers),
      ...(await serializeBody(response)),
    },
  };
  ```

- The key hash consumes exactly those serialized headers: `src/store.ts:93-95` — `ids.headers = await this.hash(JSON.stringify(request.headers), hashLen)`. So redacting at serialization time automatically affects the key. **Single choke point — no store changes needed.**

- `src/headers.ts` — `serializeHeaders(headers: Headers): Record<string, string>` (lines 13–29) and `deserializeHeaders` (34–44). Redaction helpers belong in this module.

- Option plumbing: `CreateFetchCacheOptions` (`src/fetch-cache.ts:83-87`) currently has `runtime`, `Store`, `fetch`. `createCachingMock` destructures it at line 94–98.

- `tests/fixtures/http/*.json` — committed fixtures; two of them have filenames containing `[headers=…]` hashes derived from an `x-test` header (not sensitive, so their hashes will NOT change — the redaction list doesn't include `x-test`).

- Conventions: biome (double quotes), `.js` import specifiers, TSDoc comments on exported symbols (see the doc comments throughout `src/fetch-cache.ts`).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Tests     | `pnpm test`              | all pass            |
| Lint      | `pnpm lint`              | exit 0              |

## Scope

**In scope**:
- `src/headers.ts` — redaction helper + default list
- `src/fetch-cache.ts` — apply redaction; new `redactHeaders` option
- `src/headers.spec.ts`, `src/fetch-cache.spec.ts` — tests
- `README.md` — document the behavior and the opt-out (new subsection under "Overriding the Default Caching Behaviour")
- `tests/fixtures/http/` — only if a fixture regeneration turns out to be needed (it should not be; see STOP conditions)

**Out of scope**:
- Redacting values inside **bodies** (JSON payloads with tokens) — genuinely hard, defer; note it in README as a limitation.
- `src/stores/*` and `src/store.ts` — the choke-point design means they don't change.
- Per-call (`once()`) redaction overrides — global option only for now.

## Git workflow

- Branch: `advisor/005-redact-sensitive-headers`
- Commit: `feat(security)!: redact sensitive headers before caching` — note the `!`: changed cache IDs for affected requests warrant a breaking-change marker for semantic-release (this repo releases automatically from conventional commits; a `!` triggers a major bump — flag this in your report so the maintainer can decide whether to soften it to `feat:`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Redaction helper in `src/headers.ts`

```ts
export const DEFAULT_REDACTED_HEADERS = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
];

export const REDACTED_VALUE = "[REDACTED]";

/**
 * Returns a copy of serialized headers with the named headers' values
 * replaced by REDACTED_VALUE.  Names are matched case-insensitively
 * (serializeHeaders already lower-cases keys).  Multi-value headers
 * (string[]) are replaced per-entry.
 */
export function redactHeaders(
  serialized: Record<string, string | string[]>,
  names: string[] = DEFAULT_REDACTED_HEADERS,
): Record<string, string | string[]> { /* ... */ }
```

Implementation notes: don't mutate the input; keep the header key present (so "this request was authenticated" stays visible in the fixture) but replace values; for `string[]` values replace each element.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 2: New option + wiring in `src/fetch-cache.ts`

1. Extend the options interface:

   ```ts
   export interface CreateFetchCacheOptions {
     runtime: Runtime;
     Store?: typeof FMCStore | [typeof FMCStore, Record<string, unknown>];
     fetch?: typeof origFetch;
     /** Header names to redact from cached content (and cache-key hashes).
      * Defaults to DEFAULT_REDACTED_HEADERS.  Pass `false` to disable
      * redaction entirely, or an array to replace the default list. */
     redactHeaders?: string[] | false;
   }
   ```

2. In `createCachingMock`, resolve once: `const redactList = redactHeaders === false ? null : (redactHeaders ?? DEFAULT_REDACTED_HEADERS);`

3. Apply at both serialization sites: wrap `serializeHeaders(fetchRequest.headers)` and `serializeHeaders(response.headers)` with `redactList ? redactHeaders(…, redactList) : …`. A tiny local helper keeps the two call sites tidy.

Note the runtime entry points (`src/runtimes/node.ts:46-50`, `bun.ts:21-25`, `deno.ts:63-67`) pass `{ ...options, runtime }` straight through, so the new option flows without touching them.

**Verify**: `pnpm exec tsc --noEmit` → exit 0; `pnpm test` → existing tests pass (the `x-test` header used by fixtures is not in the default list, so no fixture hash changes).

### Step 3: Tests

- `src/headers.spec.ts`: unit tests for `redactHeaders` — default list redacts `authorization`; custom list replaces the default (i.e. with `["x-custom"]`, `authorization` is NOT redacted); `string[]` set-cookie values redacted per-entry; input not mutated.
- `src/fetch-cache.spec.ts`: integration tests with `MemoryStore` and an injected fake fetch that returns a `set-cookie` response header:
  1. After a miss, the stored content (`fetchCache._store` — inspect the memory store's map, pattern at `src/fetch-cache.spec.ts:30-31`) has `request.headers.authorization === "[REDACTED]"` and response `set-cookie` redacted.
  2. **Key stability**: fetch with `Authorization: Bearer aaa`, then fetch the same URL with `Authorization: Bearer bbb` → second is a `HIT` (same cache key after redaction).
  3. `redactHeaders: false` disables: stored content contains the real header value.

**Verify**: `pnpm test` → all pass including the new tests.

### Step 4: Document

Add a README subsection "Sensitive headers are redacted by default" under "Overriding the Default Caching Behaviour": what's redacted (list), why (cache files are committed), how to disable (`createFetchCache({ Store, redactHeaders: false })`) or customize (array), the key-stability benefit (CI replays without real tokens), the migration note (existing cache entries for requests with sensitive headers get new IDs — delete and re-record), and the limitation (bodies are not redacted).

**Verify**: `grep -n "redactHeaders" README.md` → matches in the new section.

## Test plan

Covered in Step 3. The key-stability test (3.2) is the most important one — it encodes the design decision that redaction happens *before* hashing.

## Done criteria

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0; new unit + integration tests pass
- [ ] `pnpm lint` exits 0
- [ ] `git status --porcelain` shows no changes under `tests/fixtures/http` (default list mustn't affect the `x-test` fixtures)
- [ ] README documents default list, opt-out, and migration note
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The committed fixtures DO change hashes after your implementation — that means you redacted (or otherwise altered) headers outside the default list, or mutated shared state; do not regenerate fixtures to paper over it.
- The two serialization sites in `src/fetch-cache.ts` don't match the excerpts (drift — especially if plan 002 landed first, line numbers will have shifted slightly; the code shape should still match).
- You find yourself wanting to change `src/store.ts` hashing — the design forbids it; report instead.

## Maintenance notes

- Anyone adding a new place where headers get serialized into cache content must route it through the same redaction helper — reviewer should grep for `serializeHeaders(` call sites (exactly two in `src/fetch-cache.ts` today).
- Follow-ups deferred: body redaction (hard, needs schema knowledge); per-`once()` redaction overrides; a warn-mode that detects likely secrets in bodies.
- Release note must call out the one-time cache invalidation for authenticated requests.
- **Companion plan**: plans/013-redact-sensitive-query-params.md extends the same redact-before-hash design to URL query params (`?apikey=…`), which additionally reach fs-store filenames. Option naming is deliberately parallel (`redactHeaders` / `redactSearchParams`); ship both in one release so users pay the fixture-invalidation cost once.
