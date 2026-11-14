Model: `claude-fable-5-2`. Read-only adversarial review through Claude Code.

# Adversarial review: filesystem fixture identity (issue #7)

**Verdict:** I found no wrong cache hit, replay-mode violation or fixture-path escape in the built-in store. There are two subclass regressions and one over-broad compatibility filter that I would fix before shipping; none needs a redesign.

This is a read-only review of the bundle only; nothing was run, and no plan file was written because this session has no tools. `src/runtimes/bun.ts`, `src/headers.ts`, the memory store and `plans/README.md` were not in the bundle, and `filenamify-url` behaviour is from memory.

## Findings

### 1. Medium: `cache_dir` overrides now split reads from writes
- **Where:** `fetchContent` in `src/stores/fs.ts`, the `customPath` branch.
- **Trigger:** a subclass overrides the public `cache_dir` (e.g. per-suite subdirectories) but not `pathFromRequest`.
- **Mechanism:** writes still go through `pathFromRequest → cache_dir`, but reads now use `path.join(this._location, id)` directly.
- **Impact:** every read misses. `auto` silently hits the network and rewrites each run; `replay` throws for fixtures that exist. At baseline both went through `cache_dir`.
- **Fix:** also treat `this.cache_dir !== FMCFileSystemStore.prototype.cache_dir` as custom, so reads use `pathFromRequest`. Add a subclass test.

### 2. Medium: raw `bodyBase64` bypasses `uniqueRequestIdentifiers` overrides
- **Where:** `fingerprint`, the fourth tuple element.
- **Trigger:** a subclass overrides `uniqueRequestIdentifiers` to drop a volatile body, such as multipart uploads with a random boundary.
- **Mechanism:** text and JSON bodies respect the override, but binary bodies are added to the identity unconditionally.
- **Impact:** a previously stable ID for those requests now never hits. Overriding this method is not covered by the "naming/path overrides" decision.
- **Fix:** include the bytes only when the identifiers kept a body: `ids?.body !== undefined && "bodyBase64" in request ? request.bodyBase64 : null`.

### 3. Medium-low: the legacy filter rejects names that were valid on POSIX
- **Where:** `legacyFilename`, the `/[<>:"/\\|?*\u0000-\u001f]/` test.
- **Trigger:** the URL contains `[` followed later by `:`, `?`, `*` or `|`, and the ID ends in `]` (any non-GET, headers or body). Example: `POST …/items?filter[since]=2024-01-01T00:00:00Z`.
- **Impact:** that fixture existed and replayed on Linux/macOS at baseline. It is now skipped, so `replay` fails with no hint.
- **Fix:** only `/`, `\` and NUL matter for path escape, so narrow the filter to those. I am not sure Deno on Windows reports invalid-name errors as `NotFound`; if that is why the wider filter exists, keep it and name these characters in MIGRATING.md.
- **Related:** the 255-byte pre-check also skips long non-ASCII legacy names that are valid on NTFS/HFS+ (limit is in UTF-16 units). This is rare.

### 4. Low-medium: a rejected legacy fixture is invisible to the user
- **Where:** the `return null` paths after the legacy read, and `replayMissError`.
- **Impact:** the error prints only the new computed ID while a plausible-looking legacy file sits in the directory. This will be the top upgrade support question.
- **Fix:** add a `debug()` line naming the legacy file and saying its identity did not match, or append the legacy candidate to the replay error.

### 5. Process: release classification
- **Issue:** some suites that pass in `replay` today will fail after the upgrade. Besides the documented cases, any tests that relied on normalization by `filenamify-url` are affected: scheme, `www.`, trailing slash, query order.
- **Also:** the public `idFromRequest` and `pathFromRequest` outputs change.
- **Fix:** under your AGENTS.md rule this needs a `BREAKING CHANGE:` footer, not a plain `fix(store)`. List those normalizations in MIGRATING.md.

### 6. Low: TS `private` helpers and prototype-identity checks are fragile
- **Private names:** `fingerprint` and `readContent` are still ordinary prototype methods. A subclass with a same-named method hijacks them at runtime and fails type-checking. Use `#private` or module-level functions.
- **Identity checks:** `this.x !== prototype.x` also fires for `bind` in a constructor or `vi.spyOn(store, "idFromRequest")`, which silently disables legacy fallback. A comment is enough.

## Pre-existing, not regressions
- **JSON bodies:** `bodyJson` identity is lossy for integers above 2^53, duplicate keys and whitespace, because the body is parsed before hashing.
- **Other base-store behaviour:** `headers: {}` differs from absent headers; method case is not normalized for direct store calls; an explicit `id` can contain path separators.

## Test blind spots
- **Legacy replay with identifiers:** there is no positive end-to-end test through `cache()` for a legacy POST fixture with headers and a `bodyJson`. Only the negative wrong-method case exists, and this is the path where round-trip instability would show.
- **Redacted legacy fixture:** nothing replays `fmc.test!redacted!token=REDACTED.json` with a different token, which is the main v3 population.
- **Unsafe-name filter:** deleting it leaves every test green, because the escaped read just returns ENOENT. Spy on `readFile` and assert every path stays under `location`.
- **Windows reserved names:** the `con.test` case passes with or without the `!` prefix. Assert the ID starts with `!con.test`.
- **Committed-fixtures test:** it feeds each stored request back in, so it only proves filename derivation, not Request normalization or redaction. It is also vacuous on an empty directory; assert `files.length > 0`.
- **Subclass overrides:** nothing covers `cache_dir` or `uniqueRequestIdentifiers` overrides (findings 1 and 2).
- **Cross-runtime:** the golden hash is pinned on Node only. Commit one new-format fixture and replay it under Deno and Bun.
- **Uncovered branches:** the `"request"` fallback, leading `.`/`-` stripping and the 255-byte skip have no tests.

## Safe simplifications
- **One comparison instead of two fingerprints:** replace the stored/incoming fingerprint pair with `(await this.idFromRequest(legacy.request)) === id` inside the existing `try`. The prefix is a function of the URL, which is already in the hash. This also makes the `typeof legacy.request.url` guard redundant.
- **One override check:** compute a single `builtin` boolean up front (`idFromRequest`, `pathFromRequest`, `cache_dir`) instead of two separate checks.
