# 014: Collision-resistant filesystem fixture names

Issue: https://github.com/gadicc/fetch-mock-cache/issues/7
Baseline: `310c7d6`. Date: 2026-11-14. Status: DONE.

## Problem and intended behavior

`src/stores/fs.ts:85` uses `filenamifyUrl` as URL identity. Its decoding,
sanitization, scheme removal, and truncation merge distinct URLs. Reads trust
the selected file, silently replaying another request's response. Memory-store
keys distinguish these requests already.

Generate distinct filenames, preserve readable URL hints and explicit IDs,
and keep existing committed fixtures usable only for their original request.
Do not modify generated `lib/`, dependency versions, other stores' key formats,
redaction policies, or package exports. Do not commit, publish, or post comments.

## Design

1. For automatic IDs, append `-<full SHA-256>.json` to a readable URL prefix.
   Hash a versioned JSON tuple of the already-redacted URL, sorted entries
   from `uniqueRequestIdentifiers(request, 64)`, and the exact Base64 body when
   present. Framing prevents literal URL brackets from masquerading as method
   suffixes; full identifiers avoid retaining the base store's seven-character
   sub-hashes, and Base64 preserves binary bytes that TextDecoder could merge.
   These base-store limitations remain unchanged for other stores. Use only
   the injected runtime's hash API, explicitly requesting 64 hex characters.
2. Derive a stable prefix locally: strip the scheme, map characters outside
   ASCII letters/digits/dot/underscore/hyphen to `!`, remove leading dots and
   hyphens, and truncate to 60 ASCII characters. Fall back to `request` if
   empty. The complete filename is at most 130 bytes. Keep `filenamifyUrl`
   only for exact legacy reproduction; new names must not depend on its
   Unicode normalization or transitive dependency behavior.
   Store automatic fixtures under `fmc-v1/` in the configured directory. This
   separates their namespace from legacy filenames: an arbitrary old URL can
   otherwise sanitize to another request's new digest name. Explicit IDs stay
   directly in the configured directory. Verify current automatic fixture
   metadata too, so misplaced or hand-edited files cannot replay wrong data.
3. Keep `options.id` behavior: `<id>.json`, with no hash, validation against the
   URL, or legacy lookup. Explicit IDs intentionally alias requests.
4. Read the new filename first. Only if it is absent, compute the exact old
   filename using the existing regex and `filenamifyUrl` expression, then read
   that path. Probe only a single safe filename component of at most 255
   UTF-8 bytes; skip derivation failures and unsafe names (including separators
   in old bracket suffixes). Accept legacy fixtures only when recomputing the
   new fingerprint from stored request metadata matches the incoming request.
   Missing GET and explicit GET remain equivalent. Invalid or unreconstructable
   legacy request metadata is a miss. Strict metadata verification is deliberate:
   manually scrubbing stored identity can require re-recording. Do not normalize
   arbitrary recorded URL strings into potentially different identities.
5. A legacy mismatch is a miss: auto mode records to the new filename; replay
   mode throws without fetching. Legacy reads never write, rename, or delete
   files. Read paths must not create directories either. New files take
   precedence after record-mode refresh. Skip fallback for subclasses overriding
   `idFromRequest`, `pathFromRequest`, or `cache_dir`, because their contracts
   may differ. Honor custom `uniqueRequestIdentifiers` for all body types.
   Preserve
   existing errors for corrupt JSON and non-not-found filesystem failures;
   do not fall back after a corrupt or unreadable new fixture.
6. Writes always use the new automatic filename (or unchanged explicit ID).
   Previously overwritten collision victims cannot be reconstructed and need
   re-recording. No automatic bulk migration or new public option is needed.

## Implementation and regression tests

Keep the implementation in `src/stores/fs.ts`, using private helpers where
useful for read/parse and exact legacy-name generation. Keep existing public
JSDoc accurate; document the new naming and checked compatibility reads.

Extend `src/stores/fs.spec.ts` with isolated temporary fixture directories and
deterministic injected fetch implementations. Follow the existing `node:test`
and `expect` conventions, clean up only directories the new tests created.

- Each URL pair: encoded slash vs path separator, colon vs slash, bang vs
  slash, HTTP vs HTTPS, and sufficiently long URLs differing after truncation.
  Assert distinct automatic names, MISS/correct body for both initial calls,
  HIT/correct body for both later calls, including a fresh cache instance.
- Verify identity includes method, headers, and body, remains deterministic,
  preserves explicit IDs and intentional explicit-ID aliases, and respects
  query/header redaction before hashing.
- Exercise IPv6/bracketed URLs and long multibyte URL paths; actually write
  and read these files, and assert the filename byte budget.
- Exercise literal method-like URL suffixes, invalid percent encoding, and
  distinct binary payloads that decode to the same replacement character.
- Existing committed fixture remains a HIT. Checked legacy reads for ordinary
  GET, omitted method, and requests with identifiers remain read-only.
- A colliding legacy fixture is rejected for the other URL, in auto and replay
  mode. Recording the missing request must leave the old fixture intact.
- A digest-named fixture wins over stale legacy content after record refresh.
- Explicit IDs bypass automatic naming and identity verification.
- Missing files still miss; corrupt JSON and permission/I/O failures still
  throw, including on fallback. Invalid legacy request metadata cannot replay.

Use independently constructed legacy filenames/fixtures in tests, rather than
exposing production private helpers solely for testing. Update README.md,
MIGRATING.md, and skills/fetch-mock-cache/SKILL.md with the new filenames,
verified read-only legacy fallback, re-recording limits, and record-mode use.
Update related stale comments such as the bracket-splitting note in src/url.ts.

## Review sequence and verification

Before implementation, request a read-only Claude Code review with exactly
Opus 5.5 (`claude-opus-5-5`). Resolve substantive design findings in this plan.
Implement here. Then request a fresh read-only adversarial Claude Code review
with exactly Fable 5.2 (`claude-fable-5-2`) of the actual diff and tests. Validate
and address findings here; record accepted/rejected findings and limitations.
Do not silently substitute a model if either requested model is unavailable.

Verification gates:

1. `node --experimental-vm-modules --test --import tsx src/stores/fs.spec.ts`
2. `pnpm biome check --write src/stores/fs.ts src/stores/fs.spec.ts src/url.ts`
3. `pnpm test` and `pnpm run ci` (build, Biome, coverage, runtime consumers).
4. Deno documentation lint and JSON symbol documentation checks for all unique
   `jsr.json` entrypoints, with a temporary import map for `@std/path`.
5. Inspect final diff and status; no unrelated changes, generated artifacts,
   sensitive fixtures, or changed version fields.

Done means regression checks and applicable verification gates pass, both
requested reviews have completed (or an availability block is clearly
reported), substantive findings are resolved, and documentation matches.

## Reviews and outcome

Opus 5.5 reviewed the plan through Claude Code on 2026-11-14. The first
sandboxed attempt could not resolve DNS. Automatic approval initially rejected
network access over private-source concerns; GitHub then verified the repository
and exact baseline commit are public. The successful review used a fixed bundle
and no Claude tools. Model metadata confirms `claude-opus-5-5`.

Accepted: framed/full-length identifiers, exact binary identity, stable ASCII
prefix, safe bounded legacy probes, invalid-metadata misses, override isolation,
read paths without mkdir, literal legacy names, injected I/O failures, global
explicit-ID coverage, and forward/backward compatibility documentation.

Declined: URL-only legacy validation. It would accept altered request metadata
and existing short-hash collisions. Strict checking follows the agreed safety
contract; hand-edited fixtures and older redaction differences are documented
as potential re-recording cases. Legacy URL strings are compared exactly rather
than normalized, matching the package's existing URL-key semantics.

Fable 5.2 completed a fresh adversarial review through Claude Code; model metadata
confirms `claude-fable-5-2`. The full report is in
`014-fs-url-collisions-fable-review.md` (the Opus report is alongside it).

Addressed: `cache_dir` override read/write consistency; custom body identifier
policies for binary as well as text bodies; POSIX-valid legacy punctuation
(Windows-invalid syntax is skipped only on Windows); debug logs for rejected
legacy metadata; explicit breaking-release documentation; JS `#private`
helpers to avoid subclass member-name collisions. The test suite now includes
positive end-to-end legacy POST/JSON/header and redacted-credential replay,
nonvacuous legacy fixture coverage, path-read spies, Windows device-name
assertions, override regressions, and a shared new-format fixture replayed by
Node, Deno, and Bun.

Additional local adversarial finding: a legacy URL ending in a digest-looking
path can exactly match a new flat filename. A dedicated versioned subdirectory
now prevents false primary hits and accidental overwrites of that legacy
fixture. Both old and new fixtures have regression coverage for this case.
Current automatic fixtures also undergo metadata verification.

The 255-UTF-8-byte compatibility limit remains a deliberate portable probe
bound; rare legacy names accepted only by a more permissive filesystem may need
re-recording. Broad URL normalization and permissive metadata matching remain
declined. Release requires a `BREAKING CHANGE:` footer; the v3-to-v4 migration
guide documents the compatibility impact.

The focused Fable 5.2 follow-up (`014-fs-url-collisions-fable-followup.md`)
reported no remaining material correctness findings and confirmed the namespace
separation. Its smaller suggestions are addressed: current-fixture rejection
logging, format-version explanation, explicit subclass re-recording guidance,
`pathFromRequest` composition guidance, Windows-path probe coverage, and a
nonvacuous assertion on the filtered legacy JSON fixture list.

Final verification passed:

- Focused filesystem suite: 51 tests passing.
- `pnpm test` and `pnpm run typecheck`.
- `pnpm run ci`, including build, Biome CI, coverage, Node native/Jest/Vitest,
  Deno, and Bun. Every runtime replayed the same versioned golden fixture.
  The initial sandboxed install failed DNS; the network-enabled final CI passed.
- Deno documentation lint for all eight unique exported entrypoints, plus JSON
  inspection showing no top-level symbols without `jsDoc.doc`.
- Biome check/write for all changed supported source/fixture files and
  `git diff --check`.

No version fields, dependency locks, or remote state were changed. Generated
build output remains ignored. The new fixture contains only a deterministic
`fmc.test` request and `portable fixture` response. The user subsequently
requested a breaking-change commit with all model credits and `Closes #7`.
