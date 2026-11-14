Model: `claude-opus-5-5`. Read-only plan review through Claude Code.

# Review: plan 014 (collision-resistant fs fixture names)

This review is based only on the supplied bundle. I ran nothing. Where a claim depends on `filenamify-url` internals or on repo history, I mark it as something to verify.

## High priority

### H1. The digest input needs explicit framing, and the "complete base key" carries only 28-bit header and body identity
**Evidence.** `FMCStore.idFromRequest` builds `url + "[" + k=v,... + "]"`. Request URLs keep literal `[`/`]`, so `GET https://x/a[method=POST]` and `POST https://x/a` both produce `https://x/a[method=POST]`. Separately, `idFromRequest` calls `uniqueRequestIdentifiers(request)` with the default `hashLen = 7`. That means `headers=`/`body=` are 7-hex (28-bit) truncations. A full SHA-256 over a key that contains 28-bit sub-hashes is still only 28-bit collision-resistant for header and body differences. Many bodies sent to one endpoint (GraphQL, RPC) reach birthday range at about 16k variants.

**Recommendation.** I agree with the author's adjustment, and it should go further. Do not hash `super.idFromRequest()` at all. Hash a framed, versioned tuple with full-length identifiers:
```ts
const ids = await this.uniqueRequestIdentifiers(request, 64);
const input = JSON.stringify([
  "fetch-mock-cache/fs/v1",
  request.url,
  ids ? Object.entries(ids).sort(([a], [b]) => (a < b ? -1 : 1)) : null,
]);
const digest = await this.hash(input, 64);
```
- This still honours subclass overrides of `uniqueRequestIdentifiers`.
- It leaves memory and other key formats untouched.
- The domain tag allows future scheme changes.
- Update design step 1 and the claim "Memory-store keys distinguish these requests already". The memory store shares both the bracket ambiguity and the 28-bit truncation. List that as a known out-of-scope limitation.

### H2. Strict legacy verification will reject legitimate fixtures; the URL is what needs verifying
**Evidence.** The legacy filename is computed from the incoming request. The bracket suffix (method and 7-char header/body hashes) is appended verbatim, not filenamified. A file found at that name therefore already matches the incoming request's suffix. The information the legacy name lost is only:
- the URL, through filenamify decoding, scheme stripping, and truncation;
- the URL/suffix boundary (the bracket ambiguity).

Re-deriving the base key from the stored `request` adds rejection risk without adding meaningful safety:
- Users may have scrubbed headers or bodies in committed JSON by hand. AGENTS.md tells them to review fixtures for secrets.
- Any older release that hashed headers before redaction, or used a different redaction placeholder, will not reproduce the filename's hash.
- Older releases may have stored the user's URL string un-normalized, e.g. `https://example.com` versus `https://example.com/`.

In replay mode, any of these becomes a CI failure on upgrade.

**Recommendation.**
- Accept a legacy file iff `stored.request.url` is a string and `normalize(stored.url) === normalize(incoming.url)`. `normalize` should be `new URL(x).href`, falling back to the raw string on parse failure.
- Optionally also compare the method, with missing treated as `GET`, but only after confirming from git history that every past release stored `method`.
- URL equality alone resolves the author's `[method=POST]` case in both directions.
- Before choosing strict or lenient comparison, run `git log -p` over `src/fetch-cache.ts` and `src/headers.ts` for changes to request shape and redaction order.
- Add a gate that loads every committed fixture under `tests/` and asserts it still HITs.
- If the maintainer still wants strict header/body comparison, document that hand-edited fixtures need re-recording, and test against a fixture recorded by the last published release.

### H3. The legacy fallback can break the URLs this change is meant to fix (path safety and error policy)
**Evidence.** With the regex `^(.*?)(\[.*\])?$`, the first `[` in the URL starts the verbatim suffix whenever the key ends in `]`:
- **IPv6 with any identifier.** `http://[::1]:8080/a` with POST gives prefix `http://` and suffix `[::1]:8080/a[method=POST]`. The suffix contains `/`, so the path points into a subdirectory that was never created. Also, `filenamifyUrl("http://")` may throw; verify this, since it parses via normalize-url.
- **Query brackets.** `?q=[../../../tmp/x` with POST gives a suffix containing `../` segments. `path.join` resolves those outside `_location`.
- **Windows.** A backslash in a query suffix is a path separator.
- **Long names.** An unbounded verbatim suffix can raise `ENAMETOOLONG`.

Plan step 5 says to preserve non-not-found errors "including on fallback". Under that rule, `ENOTDIR`, `ENAMETOOLONG`, or a thrown filenamify error on the legacy probe would fail requests whose new-scheme name is perfectly valid.

**Recommendation.**
- Wrap legacy-name derivation in try/catch. Any throw means "no legacy candidate".
- Skip the legacy probe unless the name is a single safe component:
  - no `/`, `\`, or NUL;
  - not `.` or `..`;
  - at most 255 UTF-8 bytes.
- On the legacy path, treat `ENOTDIR` and `ENAMETOOLONG` (and the Deno equivalents) as a miss.
- Keep throwing for `EACCES`/`EIO` and for corrupt JSON in an existing file.
- Test IPv6 + POST + headers and bracketed-query + POST in both auto and replay mode.

### H4. Don't use `filenamifyUrl` for the new readable prefix
**Evidence.**
- The prefix is part of the lookup path. Any behaviour change in `filenamify-url`, including transitive `normalize-url`/`humanize-url` changes within a consumer's semver range, silently renames every fixture. Every lookup then misses, and replay-mode CI fails.
- Its percent-decoding is the only source of multibyte characters. `Request.url` and `redactSearchParams` output are WHATWG-serialized ASCII.
- It may throw on unusual URLs.

**Recommendation.** Use a tiny in-repo deterministic sanitizer:
- Take `request.url`, strip the scheme, and map any character outside `[A-Za-z0-9._-]` to `_` (or `!` for familiarity).
- Strip leading `.`/`-` so files are not hidden and don't look like CLI flags.
- Cap at about 60–80 bytes.

This removes the Unicode byte-budget problem entirely and makes names identical across Node, Deno, and Bun and across dependency versions. It also gives a shorter total (about 150 bytes), which helps with eCryptfs's ~143-byte limit and with Windows `MAX_PATH`.

Keep `filenamifyUrl` only for legacy-name reproduction. If the author keeps `filenamifyUrl` anyway:
- truncate with `Array.from(s).slice(0, 40)` so surrogate pairs are not split;
- catch errors and fall back to the ASCII sanitizer;
- note that 40 code points is at most 160 bytes, so the arithmetic of 160 + 70 ≤ 255 is correct.

## Medium priority

**M1. Binary request bodies are identified lossily.** `uniqueRequestIdentifiers` hashes `new TextDecoder().decode(body)` without `fatal`. Distinct binary bodies that differ only in invalid-UTF-8 bytes (all mapped to U+FFFD) get the same id, so two image uploads to one endpoint can collide. A full-length hash does not fix this. In the fs digest tuple, add a hash of `request.bodyBase64` when it is present. Otherwise, document this as a limitation.

**M2. Pin down what "invalid metadata" does.** Recommended semantics:
- Corrupt JSON at either path: throw (current behaviour).
- Valid JSON whose `request`/`request.url` is missing or ill-typed, or where identifier recomputation throws (`Unexpected body type`, `Invalid body: null expected`): treat as a miss and emit a debug log. Never throw, never HIT.

**M3. Replay diagnostics.** `replayMissError` will print the new computed id while a legacy file is visibly present, which will confuse users. Add `debug("fetch-mock-cache:fs")` logging for "legacy fixture X rejected: recorded for <url>" and "legacy fixture X used". Mention the logging in MIGRATING.md. This keeps the change inside `fs.ts`.

**M4. Compatibility surface and semver.** Note each of these in MIGRATING.md and choose the commit type deliberately:
- Fixtures recorded by the new version are invisible to older versions, e.g. in monorepos or among team members on different versions.
- The outputs of the public `idFromRequest`/`pathFromRequest` change.
- Record refreshes leave orphaned legacy files behind.
- Subclasses that override `idFromRequest` should not get a legacy probe. Run the fallback only from the built-in automatic-id branch.

**M5. "Read-only" is not quite true today.** `fetchContent` goes through `cache_dir`, which calls `mkdir` even in replay mode. Either build read paths with `path.join` and no `mkdir` (a missing directory then simply means a miss), or narrow the plan's claim to "never writes, renames, or deletes fixture files".

## Low priority / test and plan hygiene

- **Golden legacy names in tests.** Pin legacy names as literal strings (e.g. `fmc.test!a!b.json`), not names recomputed with `filenamify-url`. This catches drift in the legacy algorithm and in the dependency.
- **Inject I/O failures instead of using chmod.** Use a stub runtime `fs`, e.g. `{ ...runtime, fs: { ...runtime.fs, readFile } }` throwing `EACCES`. chmod-based tests pass vacuously as root and behave differently on Windows.
- **Explicit-ID tests.** Also cover a global `createFetchCache({ id })`, which aliases every request.
- **Case-insensitive filesystems.** The digest keeps new names distinct. Legacy names can alias on these filesystems, which URL verification covers. Add a legacy test for URLs that differ only in path case.
- **Dead code.** The `"Invalid id"` branch is unreachable because the regex always matches. Drop it from the legacy helper.
- **Helper placement.** Prefer module-level non-exported functions over class members. They create no JSR documentation burden and no subclass surface.
- **Stale comment in `src/url.ts`.** The `REDACTED_PARAM_VALUE` comment should say that the bracket constraint now matters only for reproducing legacy names.
- **Digest length.** Full 64-hex is fine. 32-hex would be enough if path length becomes a problem.

## Verdict

The direction is right: a digest-suffixed name, explicit IDs untouched, and a verified, read-only legacy fallback that never auto-migrates. The plan is close, but it needs five changes before implementation:

1. Hash a framed, versioned tuple with full-length identifiers (H1). This incorporates the author's adjustment and extends it.
2. Verify legacy fixtures by normalized URL rather than a re-derived base key, after checking history (H2).
3. Guard the legacy probe against unsafe or overlong names and against throws (H3).
4. Replace `filenamifyUrl` with an ASCII sanitizer for the new prefix (H4).
5. Specify miss-versus-throw semantics for invalid metadata (M2).

With those changes, the Unicode and IPv6 concerns mostly go away and the compatibility story becomes testable.
