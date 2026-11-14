Model: `claude-fable-5-2`. Read-only follow-up review through Claude Code.

# Follow-up review: filesystem fixture identity (issue #7)

**Verdict:** no material correctness findings remain. I found no wrong hit, replay-mode violation, path escape or read/write split in the revised store, and the `fmc-v1` namespace is sound. What is left is one low-medium diagnosability gap introduced by the new current-fixture check, plus two low naming and documentation items.

This is a read-only review of the bundle; nothing was run, and no plan file was written because this session has no tools. `src/fetch-cache.ts`, `src/url.ts`, `README.md`, `SKILL.md`, `tests/runtimes/test.sh` and the golden fixture itself were not in the bundle.

## Status of the original findings

| # | Status | How |
|---|---|---|
| 1 | Resolved | `#usesBuiltinPaths()` includes `cache_dir`, so reads and writes both go through `pathFromRequest`; there is a subclass test. |
| 2 | Resolved | Raw bytes are added only when `uniqueRequestIdentifiers` is the base method and it kept a body. Your prototype check is stricter than the fix I suggested, and correctly so: mine would have broken the "normalized body" override case you now test. |
| 3 | Resolved | Only `/`, `\` and NUL are rejected everywhere; the Windows set applies only on Windows, and MIGRATING names the limits. |
| 4 | Resolved for legacy | The debug line reports a used or rejected legacy fixture. Finding A below is the same gap on the new path. |
| 5 | Documented | MIGRATING lists the normalizations and calls for the `BREAKING CHANGE:` footer. |
| 6 | Resolved | Helpers are `#private`, and the comment covers bound methods and spies. |

## Remaining findings

### A. Low-medium: a rejected current fixture is silent, and `auto` overwrites it
- **Where:** `fetchContent`, the `content !== undefined` branch; the debug line exists only on the legacy branch.
- **Trigger:** someone edits `request` metadata in an `fmc-v1/` file, for example hand-scrubbing a token from a header your redaction list does not cover. A bad merge resolution or a copied fixture file does the same.
- **Impact in `replay`:** the miss error names a file that exists, with no hint why it was rejected.
- **Impact in `auto`:** the request silently hits the network and the file is rewritten, which puts the scrubbed value back. Before this change, editing stored request metadata had no effect on lookup.
- **Fix:** log the rejection, and add one MIGRATING sentence saying current fixtures are verified too, so request metadata must be re-recorded rather than edited.
  ```ts
  if (content !== undefined) {
    const matches = await this.#matchesRequest(content, id);
    if (!matches) debug("Rejected current fixture %o (stored request differs)", id);
    return matches ? content : null;
  }
  ```

### B. Low: `fmc-v1` reads as "package v1"
- **Trigger:** the package is at v3, MIGRATING has a "From v1 to v2" section, and the new section tells users to "remove obsolete legacy files". A directory called `fmc-v1` is the obvious thing to delete.
- **Fix:** rename it before release, when it is still free; something like `fmc-fs-v1` would echo the hash tag `fetch-mock-cache/fs/v1`. Otherwise add a sentence saying `v1` is the fixture-identity format version, not the package version.

### C. Low: MIGRATING wording for path overrides is misleading
- **"Retain their custom lookup behavior":** a subclass that overrides only `cache_dir` or `pathFromRequest` still gets the new digest filenames and no legacy fallback. Every existing fixture misses on upgrade. Say outright that these subclasses must re-record.
- **`cache_dir(id)` composition:** `cache_dir(await idFromRequest(req))` no longer locates an automatic fixture, because automatic files bypass `cache_dir`. Point callers to `pathFromRequest`.

### D. Test gaps
- **Windows branch:** `legacyFilename(..., true)` is never exercised. Inject `path.win32` with a stubbed `readFile` and assert that no legacy read is attempted for `https://fmc.test/a:b`.
- **Committed-fixtures test:** `files.length > 0` is checked before the `.json` filter, so it is satisfied by the `fmc-v1` directory alone. Assert on the filtered list.

## Namespace critique

- **Both layers are needed.** Verification alone would turn a mimicking legacy file into a miss, and `auto` would then overwrite it. The subdirectory is what preserves it, and verification is what catches edited or copied files.
- **Explicit IDs are unaffected.** They stay in the root, unverified, and can no longer collide with automatic names.
- **Legacy probes cannot reach `fmc-v1/`.** They never contain a separator.
- **Replay stays read-only.** Built-in reads create no directories.
- **Mimicry in `cache_dir`-only subclasses is not material.** They get neither the namespace nor verification, but a wrong hit needs a legacy URL that embeds the SHA-256 of a different request.

## Not verifiable from the bundle

- **Flat-directory assumptions:** any cleanup or ignore glob such as `tests/fixtures/http/*.json` in `test.sh` or `.gitignore` would leave `fmc-v1/` behind. The runtime "fs store" tests would then see a HIT on the first iteration of a second run.
- **Biome:** the regex literals with `\u0000` and `\u0001-\u001f` may trip `noControlCharactersInRegex`.
- **Coherence:** README and SKILL.md path examples should show `fmc-v1/`.
