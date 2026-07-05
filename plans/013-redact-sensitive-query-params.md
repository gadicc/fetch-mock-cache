# Plan 013: Redact sensitive query params before caching (filenames, fixture content, and cache keys)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a092fef..HEAD -- src/fetch-cache.ts src/store.ts src/stores/fs.ts src/fetch-cache.spec.ts tests/fixtures/http README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. **Exception**: if plan 005
> (header redaction) has already landed, `src/fetch-cache.ts` will have a
> `redactHeaders` option and redaction wiring — that is expected drift;
> follow the "Coordination with plan 005" notes below instead of stopping.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (changes cache IDs — and fs-store *filenames* — for requests whose URLs carry a listed param; one-time cache invalidation for affected users)
- **Depends on**: plans/001-offline-deterministic-tests.md (offline verification harness); plans/005-redact-sensitive-headers.md (soft — independent mechanics, but shared option-naming convention and README section; release together, see "Why this matters")
- **Category**: security
- **Planned at**: commit `a092fef`, 2026-07-05

## Why this matters

The library's documented workflow is to commit `tests/fixtures/http` to source
control. The fs store derives each fixture's **filename** from the full request
URL, query string included. Any user whose tests call an API keyed by query
param (e.g. TwelveData's `?apikey=…`, Google Maps' `?key=…`) commits their live
API key **in the filename itself** — worse than the header case (plan 005),
because the secret is visible in `git status`, directory listings, and GitHub's
file browser without even opening a file. The same URL is stored verbatim as
`request.url` inside the fixture JSON, and it is the base of the cache key.

Observed real-world failure (downstream project using this library against
TwelveData): committed fixtures embedded developer A's API key; developer B
(different key in `.env.local`) got cache misses on every run → live network
calls in tests → a duplicate fixture set recorded under B's key. Redacting the
param **before** keying fixes both problems at once: no secret in the repo, and
one fixture set replays for everyone regardless of which key they hold.

**Design decision (deliberate, matches plan 005)**: redaction happens *before*
hashing/keying, so cache IDs are stable across differing secret values. The
alternative — store `REDACTED` but hash the original value — was considered and
rejected as the default: it would keep every developer/CI environment on
different cache keys, which is exactly the observed failure. "The secret was
used" remains visible because the param *name* is preserved with a `REDACTED`
value (and a request *without* the param produces a different URL, hence a
different fixture). A per-name "distinct" mode (hash original, store redacted —
for APIs where different keys genuinely return different responses, e.g.
entitlement tiers) is explicitly deferred; see Maintenance notes.

Release coordination: like plan 005, this is a breaking change (one-time cache
invalidation). Ship 005 and 013 in the **same release** so users re-record
fixtures once, not twice.

## Current state

- `src/fetch-cache.ts` — the URL enters cache content (and therefore the key
  and the fs filename) here; the same `url` variable is also used for the real
  network call, which must keep the ORIGINAL url:

  ```ts
  // src/fetch-cache.ts:132-143
  const url = fetchRequest.url;

  const clonedRequest = fetchRequest.clone();
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

  ```ts
  // src/fetch-cache.ts:165 — the real fetch; MUST keep the original url
  const p = fetch(url, requestInit);
  ```

- `src/store.ts:118-137` — `idFromRequest` uses `request.url` verbatim as the
  base of the id, then appends `[method=…,headers=…,body=…]` hash suffixes from
  `uniqueRequestIdentifiers`. Because the store receives the already-redacted
  request object, **no store changes are needed** — same single-choke-point
  design as plan 005.

- `src/stores/fs.ts:57-66` — the fs store splits the id into URL part and
  bracket suffix, and filenamifies only the URL part:

  ```ts
  // src/stores/fs.ts:62-65
  const id = await super.idFromRequest(request);
  const parts = id.match(/^(.*?)(\[.*\])?$/);
  if (!parts) throw new Error("Invalid id");
  return filenamifyUrl(parts[1]) + (parts[2] || "") + ".json";
  ```

  **Consequence**: the replacement value must contain no `[` or `]`
  characters, or this regex mis-splits and raw URL characters leak into
  filenames. Use bare `REDACTED` (NOT plan 005's `[REDACTED]` — that value is
  safe only because headers never reach the filename, only their hash does).

- Option plumbing: `CreateFetchCacheOptions` (`src/fetch-cache.ts:83-87`)
  currently has `runtime`, `Store`, `fetch`; `createCachingMock` destructures
  it at lines 94–98. If plan 005 landed first it will also have
  `redactHeaders?: string[] | false` — add `redactSearchParams` alongside it in
  the same style. The runtime entry points (`src/runtimes/node.ts:46-50`,
  `bun.ts:21-25`, `deno.ts:63-67`) spread `{ ...options, runtime }` straight
  through, so the new option flows without touching them.

- `tests/fixtures/http/` — committed fixtures include
  `echo.free.beeceptor.com!key=value&one=two.json` (and two `[headers=…]`
  variants). The param name `key` is used as a **non-secret** test param here.
  This is why `key` must NOT be in the default redaction list, and why the done
  criteria require these fixtures to be byte-identical after the change.

- `src/stores/memory.ts:27` — `store: Map<string, FMCCacheContent>`; the map
  key is the full id, so integration tests can assert the redacted URL appears
  in the key (pattern for reaching the store: `fetchCache._store`, see
  `src/fetch-cache.spec.ts:30`).

- Conventions: biome (double quotes), `.js` import specifiers, TSDoc comments
  on all exported symbols (see `src/headers.ts` and `src/fetch-cache.ts` for
  the style). New module + spec file mirrors the `src/headers.ts` /
  `src/headers.spec.ts` pairing.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Tests     | `pnpm test`              | all pass            |
| Lint      | `pnpm lint`              | exit 0              |

**Caution**: until plan 001 is DONE, `pnpm test` deletes `tests/fixtures/http`
and performs live network requests. If 001 has not landed, verify with the
network-free specs only (`node --test` on `src/url.spec.ts`,
`src/fetch-cache.spec.ts` with an injected fake fetch) and STOP before any
command that would delete fixtures.

## Scope

**In scope** (the only files you should modify/create):
- `src/url.ts` (create) — redaction helper + default param list
- `src/url.spec.ts` (create) — unit tests
- `src/fetch-cache.ts` — new `redactSearchParams` option; apply at the URL choke point
- `src/fetch-cache.spec.ts` — integration tests
- `README.md` — document behavior, defaults, opt-outs
- `plans/README.md` — status row update when done

**Out of scope** (do NOT touch, even though they look related):
- `src/store.ts`, `src/stores/*` — the choke-point design means they don't change; if you find yourself editing them, you've put the redaction in the wrong place.
- `src/headers.ts` — header redaction is plan 005's territory.
- Request/response **bodies** — form-encoded or JSON payloads may carry the same secrets; genuinely hard, deferred (same as plan 005). Note as a README limitation.
- Secrets embedded in URL **path segments** (Slack webhook URLs, Telegram `/bot<token>/` paths) — no param name to match on; deferred (see Maintenance notes). The existing per-request `fetchCache.once({ id: "my-id" })` override is the current escape hatch.
- URL userinfo (`https://user:pass@host/`) — nothing to do: the WHATWG fetch spec makes `new Request(url)` throw a TypeError for credentialed URLs, so such a URL can never reach the cache.

## Git workflow

- Branch: `advisor/013-redact-sensitive-query-params`
- Commit: `feat(security)!: redact sensitive query params before caching` — the `!` marks the one-time cache-ID invalidation; this repo releases automatically via semantic-release from conventional commits, and a `!` triggers a major bump. Flag in your report that this should ship in the same release as plan 005.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `src/url.ts` with the redaction helper

```ts
/**
 * @module
 * Redaction of sensitive query params from URLs before they are cached.
 * The fs store derives fixture FILENAMES from the URL, so a secret in a
 * query param would otherwise be committed in the filename itself.
 */

/**
 * Query param names (matched case-insensitively) whose values are redacted
 * by default before the URL is hashed or stored.  Deliberately conservative:
 * over-redaction makes distinct requests collide onto one fixture.
 * Notably NOT included: `key` (too generic — commonly a non-secret data
 * param; Google Maps users should add it explicitly).
 */
export const DEFAULT_REDACTED_SEARCH_PARAMS = [
  "apikey",
  "api_key",
  "api-key",
  "access_token",
  "token",
  "client_secret",
  "secret",
  "password",
  "signature",
  "sig", // Azure SAS
  "x-amz-signature", // AWS presigned URLs
  "x-amz-security-token",
  "x-amz-credential",
];

/**
 * Replacement value for redacted params.  MUST NOT contain "[", "]", "?",
 * "&" or "#": the fs store splits cache ids on brackets
 * (src/stores/fs.ts idFromRequest) and the value lands in filenames.
 */
export const REDACTED_PARAM_VALUE = "REDACTED";

/**
 * Returns `url` with the values of the named query params replaced by
 * REDACTED_PARAM_VALUE.  Names match case-insensitively.  Every occurrence
 * of a repeated param is redacted.  If no param matches, returns the input
 * string UNCHANGED (===) so that URL re-serialization can never alter cache
 * ids of unaffected requests.
 */
export function redactSearchParams(
  url: string,
  names: string[] = DEFAULT_REDACTED_SEARCH_PARAMS,
): string { /* ... */ }
```

Implementation notes:

- Parse with `new URL(url)`; iterate `url.searchParams` keys; compare
  lowercased key against the lowercased name list; on match, set every value
  for that key to `REDACTED_PARAM_VALUE` (use `getAll`/`delete`/`append` or
  index-preserving iteration — repeated params like `?token=a&token=b` must
  all be redacted).
- Track whether anything matched; if nothing did, `return url;` (the original
  string, not `parsedUrl.toString()`). This is load-bearing: `URL`
  serialization can differ from the input (percent-encoding, default-port
  dropping), and any such difference would silently invalidate every existing
  user fixture. Only redacted URLs may be re-serialized.
- `fetchRequest.url` is always an absolute, already-normalized URL (it comes
  from a constructed `Request`), so `new URL(url)` cannot throw here — but
  wrap defensively: on a parse error, return the input unchanged.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 2: Unit tests in `src/url.spec.ts`

Model the file structure on `src/headers.spec.ts` (node:test + expect). Cases:

1. `?apikey=sk123&symbol=AAPL` → `?apikey=REDACTED&symbol=AAPL` (order preserved).
2. Case-insensitive: `?apiKey=x` and `?APIKEY=x` both redacted.
3. Repeated params: `?token=a&b=2&token=c` → both `token` values redacted.
4. No match → the exact same string instance/value is returned
   (`expect(redactSearchParams(u)).toBe(u)`), including for a URL with no
   query string at all.
5. Custom list replaces the default: with `["custom"]`, `apikey` is NOT
   redacted and `custom` is.
6. Guard: `REDACTED_PARAM_VALUE` contains none of `[`, `]`, `?`, `&`, `#`.
7. Guard: `"key"` is not in `DEFAULT_REDACTED_SEARCH_PARAMS` (protects the
   committed `key=value` fixtures from a future careless list edit).

**Verify**: `node --test src/url.spec.ts` (or the repo's per-file test
invocation) → all pass. (Network-free; safe before plan 001.)

### Step 3: New option + wiring in `src/fetch-cache.ts`

1. Extend the options interface (alongside `redactHeaders` if plan 005 landed):

   ```ts
   export interface CreateFetchCacheOptions {
     runtime: Runtime;
     Store?: typeof FMCStore | [typeof FMCStore, Record<string, unknown>];
     fetch?: typeof origFetch;
     /** Query param names whose values are redacted from cached URLs —
      * fixture filenames, stored content, and cache-key derivation all see
      * the redacted URL; the real network request is unaffected.  Defaults
      * to DEFAULT_REDACTED_SEARCH_PARAMS.  Pass `false` to disable, or an
      * array to replace the default list. */
     redactSearchParams?: string[] | false;
   }
   ```

2. In `createCachingMock`, resolve once:
   `const paramRedactList = redactSearchParams === false ? null : (redactSearchParams ?? DEFAULT_REDACTED_SEARCH_PARAMS);`

3. At the choke point, split the cached URL from the fetched URL:

   ```ts
   const url = fetchRequest.url;
   const cacheUrl = paramRedactList
     ? redactSearchParams(url, paramRedactList)
     : url;
   ```

   Use `cacheUrl` in `cacheContentRequest.url` and in the two `debug(...)`
   log lines; keep the original `url` for the real call
   (`fetch(url, requestInit)` at line 165). Do NOT change what is passed to
   the network. (If plan 002 landed first, the network call passes the
   original `fetchRequest` instead of `url` — same rule: redaction stays on
   the cache-content side only.)

   Import naming: the module-level option field and the imported helper share
   the name `redactSearchParams`; alias the import
   (`import { redactSearchParams as redactUrlSearchParams, DEFAULT_REDACTED_SEARCH_PARAMS } from "./url.js";`)
   to avoid shadowing.

**Verify**: `pnpm exec tsc --noEmit` → exit 0. Then
`git status --porcelain tests/fixtures/http` → empty, and if plan 001 has
landed, `pnpm test` → all pass with **zero fixture diffs** (no committed
fixture URL contains a listed param — `key` and `one` are not in the list).

### Step 4: Integration tests in `src/fetch-cache.spec.ts`

Add a `describe("redactSearchParams", ...)` block. Use `MemoryStore` and an
**injected fake fetch** so no network is touched:

```ts
const fakeFetch = (async () =>
  new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
const fetchCache = createFetchCache({ Store: MemoryStore, fetch: fakeFetch });
const store = fetchCache._store! as MemoryStore;
```

Cases:

1. **Content + key redaction**: fetch
   `https://api.example.com/eod?apikey=sk-live-123&symbol=AAPL` → the stored
   content's `request.url` contains `apikey=REDACTED` and not `sk-live-123`;
   the memory-store map key (`[...store.store.keys()][0]`) likewise contains
   `apikey=REDACTED` (this is what becomes the fs filename).
2. **Key stability across secrets**: fetch same URL with `apikey=AAA`, then
   with `apikey=BBB` → second response has `X-FMC-Cache: HIT`. This test
   encodes the core design decision — redact *before* keying.
3. **Presence still distinguishes**: after (2), fetch the same URL *without*
   `apikey` → `X-FMC-Cache: MISS` (a new, distinct fixture). "The key was
   used" stays observable.
4. **Opt-out**: `createFetchCache({ Store: MemoryStore, fetch: fakeFetch, redactSearchParams: false })`
   → stored `request.url` contains the real value.
5. **Custom list**: `redactSearchParams: ["session"]` → `session` redacted,
   `apikey` NOT redacted.

**Verify**: run the spec file → all pass, including 5 new tests.

### Step 5: Document in README.md

Extend (or create, if plan 005 hasn't landed yet) the redaction subsection
under "Overriding the Default Caching Behaviour". Must cover:

- Why: fixtures are committed; query-param secrets otherwise land in fixture
  **filenames** as well as content.
- The default param list, and that matching is case-insensitive.
- That redaction happens before keying → one fixture set replays for every
  developer/CI regardless of their local key value; a request without the
  param still records a separate fixture.
- How to customize: `redactSearchParams: [...DEFAULT_REDACTED_SEARCH_PARAMS, "key"]`
  (the Google Maps case) or disable with `redactSearchParams: false`.
- The deliberate-commit case (e.g. a project that intentionally commits
  cookies because they carry regional/consent context): show combining
  options — keep `redactSearchParams` on while customizing plan 005's
  `redactHeaders` list to exclude `cookie`/`set-cookie`.
- Migration note: existing cache entries whose URLs carry a listed param get
  new IDs *and new filenames* — delete the old fixture files and re-record.
- Limitations: bodies are not redacted; secrets in URL *path* segments are
  not detected (use `fetchCache.once({ id })` to name such fixtures manually).

**Verify**: `grep -n "redactSearchParams" README.md` → matches in the new/extended section.

## Test plan

Covered by Steps 2 and 4. The must-have assertions, in priority order:
key-stability HIT across differing secret values (4.2); redacted value absent
from stored content and store key (4.1); byte-identical committed fixtures
(`git status --porcelain tests/fixtures/http` empty); the `.toBe(...)`
identity check for unmatched URLs (2.4) — it pins the no-normalization rule
that protects every existing user's fixtures.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm lint` exits 0
- [ ] Unit + integration tests from Steps 2 and 4 exist and pass
- [ ] `pnpm test` exits 0 (only if plan 001 has landed; otherwise the network-free specs)
- [ ] `git status --porcelain tests/fixtures/http` → empty (committed fixtures byte-identical)
- [ ] `grep -n '"key"' src/url.ts` → no match inside `DEFAULT_REDACTED_SEARCH_PARAMS` (the guard test from Step 2.7 also enforces this)
- [ ] `grep -n "redactSearchParams" README.md` → documented
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any committed fixture under `tests/fixtures/http` changes content or
  filename — the default list is too broad, or unmatched-URL
  re-serialization leaked in. Do not regenerate fixtures to make it pass.
- The choke-point code in `src/fetch-cache.ts` doesn't match the excerpts
  AND the difference is not the expected plan-002/005 drift described in the
  drift-check note.
- You find yourself wanting to modify `src/store.ts` or `src/stores/*` — the
  redaction belongs before the store sees the request; report instead.
- Redacting inside `fetchRequest.url` seems to require touching what is sent
  to the network — it must not; the real request always uses original values.

## Coordination with plan 005 (read before starting)

- 005 redacts **headers** at `serializeHeaders(...)` call sites; this plan
  redacts the **URL**. Different choke points, zero file conflicts except the
  `CreateFetchCacheOptions` interface and the README section — merge them
  additively, matching whichever landed first.
- Option naming is deliberately parallel: `redactHeaders` /
  `redactSearchParams`, both `string[] | false`, both default-on, both
  exporting their default list so users can extend or filter it.
- Both are `feat(security)!`; recommend to the maintainer that they ship in
  one release so users pay the fixture-invalidation cost once.

## Maintenance notes

- Anyone adding a new place where the request URL reaches cache content, ids,
  or logs must route it through the redaction helper — grep for
  `cacheContentRequest` construction and `request.url` consumers when
  reviewing.
- Deferred follow-ups (deliberate, do not implement here):
  - **"distinct" mode** — per-name option to hash the original value while
    storing `REDACTED`, for APIs where different keys return different
    responses (entitlement tiers, per-key regional routing). Fits a future
    per-entry shape like `{ name: "apikey", mode: "stable" | "distinct" }`.
  - **"ignore" mode / volatile params** — cache-busters (`_=…`), timestamps,
    nonces cause needless MISSes; dropping them from the key entirely is
    normalization, not redaction. Same option surface could host it; pairs
    naturally with the plan 011 cache-modes spike.
  - **Path-segment secrets** (Slack webhooks `/services/T…/B…/xxx`, Telegram
    `/bot<token>/`) — needs a user-supplied pattern or `redactUrl` callback;
    no safe auto-detection by name.
  - **Body redaction** (OAuth `client_secret` form posts, GraphQL variables)
    — also deferred by plan 005; needs schema knowledge.
  - **Unified option** — a future `redact: { headers, searchParams, url }`
    object could consolidate the two parallel options; not worth a breaking
    reshape now.
- Reviewer scrutiny points: the `=== url` identity return for unmatched URLs
  (fixture-stability guarantee); that `fetch(url, requestInit)` still gets
  the original URL; that `REDACTED_PARAM_VALUE` stays bracket-free.
- Release note must call out the one-time invalidation *including filename
  changes* (users must delete old fixture files, not just expect overwrite).
