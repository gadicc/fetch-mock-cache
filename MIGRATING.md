# Migrating fetch-mock-cache

## Table of Contents

- [From v3 to v4 (2026-11-14)](#from-v3-to-v4-2026-11-14)
- [From v2 to v3 (2026-07-08)](#from-v2-to-v3-2026-07-08)
- [From v1 to v2](#from-v1-to-v2)

## From v3 to v4 (2026-11-14)

v4 prevents distinct URLs from replaying each other's filesystem fixtures.
New automatic fixtures use full SHA-256 names under `fmc-v1/`. Existing
fixtures remain readable when their stored request identity verifies;
explicit IDs and memory-store keys are unchanged.

**Action:** Upgrade contributors and CI together, then run your tests in
replay mode. Re-record missing or rejected fixtures with
`FMC_CACHE_MODE=record pnpm test`, review the new files, and commit them.
Keep `fmc-v1/`; remove obsolete legacy files only after replay passes.
Custom filesystem-store subclasses may also need re-recording.

### Filesystem fixture identity and compatibility details

The filesystem store now writes `fmc-v1/<readable-url-prefix>-<sha256>.json`,
with a full SHA-256 fingerprint of the redacted request identity. This prevents
distinct URLs from sharing fixtures when filename sanitization removes their
differences. Methods, headers, and bodies also participate in the fingerprint;
binary bodies retain their exact bytes. The versioned subdirectory prevents
legacy URL-based names from masquerading as new digest names or being
overwritten by them. Explicit `id` values still produce `<id>.json` directly
in the configured directory. Memory-store keys are unchanged.

Here `v1` identifies the fixture-identity format, independently of the package
version. Keep the `fmc-v1` directory when removing obsolete legacy fixtures.

Existing URL-based fixture names remain readable when their stored request
metadata reproduces the requested identity. Reads do not create directories,
rewrite, rename, or delete fixtures. Unsafe or overlong legacy lookup names
are skipped. A legacy fixture for another request is a cache miss: `auto`
records that request separately, while `replay` throws before network access.
Invalid JSON and permission or I/O failures for usable paths still throw.

Legacy probes exclude path separators, NUL, names over 255 UTF-8 bytes, and
Windows-invalid characters on Windows. POSIX-valid query punctuation remains
supported on POSIX. Enable `DEBUG=fetch-mock-cache:fs` to see whether a legacy
fixture was used or rejected by identity checking.

Current fixtures are verified too. Changing or copying their request metadata
can cause a miss; in `auto` mode the request is fetched again and the fixture
is overwritten. Configure redaction before re-recording rather than editing
request identity by hand. Rejected current fixtures also appear in the debug log.

Some fixtures need re-recording: a response previously overwritten by a naming
collision cannot be recovered, and hand-edited, missing, or changed request
metadata cannot be verified. Fixtures from older redaction policies may also
need re-recording; stored URL identity is compared exactly. To refresh:

```bash
FMC_CACHE_MODE=record pnpm test
```

Record mode writes new filenames and leaves old files intact. New files take
precedence during later replay; review and remove obsolete legacy files when
the migration is complete. Older package versions cannot find the new names,
so coordinate dependency upgrades across contributors and workspaces.

The public `idFromRequest` and `pathFromRequest` results change for automatic
IDs. Subclasses overriding either method or `cache_dir` retain their custom
lookup behavior and do not use the built-in legacy fallback. Bound or spied-on
methods also count as overrides. Overrides of `uniqueRequestIdentifiers` remain
authoritative, including custom body normalization.

Subclasses overriding only `cache_dir` or `pathFromRequest` inherit the new
digest filenames without legacy fallback, so their existing fixtures need
re-recording. Call `pathFromRequest(request)` to locate an automatic fixture;
composing `cache_dir(await idFromRequest(request))` no longer finds its
versioned location.

Tests that previously relied on URL-name collisions (including HTTP/HTTPS,
`www.`, trailing-slash, or query-order differences) now require separate
fixtures. Automatic IDs and paths change, and legacy verification can turn
old hits into misses; these are breaking changes in v4.

## From v2 to v3 (2026-07-08)

v3 keeps the default cache behavior compatible with v2 for ordinary requests:
read from cache first, fetch on misses, then write the response. The main
migration work is around runtime support and requests that include sensitive
headers or query parameters.

BREAKING CHANGES:

- **Node.js support**

  - v2: Node.js 20+
  - v3: Node.js 22+

  Update local development, CI, and any package `engines` constraints before
  upgrading the Node runtime entrypoint.

- **Sensitive headers are redacted by default**

  v3 replaces values for these request and response headers before storing
  fixtures. Request headers also use the redacted values when hashing cache
  IDs:

  - `authorization`
  - `proxy-authorization`
  - `cookie`
  - `set-cookie`
  - `x-api-key`

  This prevents credentials from being committed in fixtures, but it changes
  cache IDs for requests whose fixture names included a header hash. Existing
  fixtures recorded with any of these headers will miss until they are
  re-recorded, or until header redaction is disabled.

- **Sensitive query parameters are redacted by default**

  v3 replaces values for these query parameters before storing the request URL
  and deriving cache IDs or file names:

  - `apikey`
  - `api_key`
  - `api-key`
  - `access_token`
  - `token`
  - `client_secret`
  - `secret`
  - `password`
  - `signature`
  - `sig`
  - `x-amz-signature`
  - `x-amz-security-token`
  - `x-amz-credential`

  The real network request is unchanged. Only the cached representation is
  redacted. Existing fixtures whose URLs contain one of these parameters will
  get new fixture IDs and file names under v3.

  The recommended migration is to inspect and remove the old sensitive
  fixtures, run once in record mode, then commit the newly redacted fixtures:

  ```bash
  FMC_CACHE_MODE=record pnpm test
  ```

  If you need temporary v2-compatible cache IDs while migrating, disable
  redaction when creating the cache:

  ```ts
  const fetchCache = createFetchCache({
    Store,
    redactHeaders: false,
    redactSearchParams: false,
  });
  ```

  Prefer re-recording redacted fixtures over keeping this compatibility mode,
  because disabling redaction can keep secrets in committed fixture files.

- **File-system store errors are stricter**

  v2 treated any file read or JSON parse failure as a cache miss. v3 only
  treats a missing fixture file as a miss. Invalid JSON, permission failures,
  and other read errors now throw instead of silently falling through to the
  network.

  If an upgrade starts failing on an existing fixture, fix the JSON or delete
  and re-record that fixture.

Notable additions and behavior changes:

- **Cache modes**

  v3 adds first-class cache modes. The default `auto` mode is the v2 behavior.

  | Mode | Reads cache | Writes cache | Cache miss behavior |
  | ---- | ----------- | ------------ | ------------------- |
  | `auto` | yes | yes | Fetch from network and cache the response |
  | `replay` | yes | no | Throw before reaching the network |
  | `record` | no | yes | Fetch from network and overwrite the cache |
  | `off` | no | no | Fetch from network without touching the cache |

  Set modes globally with `createFetchCache({ mode: "replay" })`, later with
  `fetchCache.options = { mode: "record" }`, for one call with
  `fetchCache.once({ mode: "off" })`, or through `FMC_CACHE_MODE`.

- **Global cache options**

  `id`, `mode`, `readCache`, and `writeCache` can now be passed to
  `createFetchCache` as defaults and changed through `fetchCache.options`.
  Existing `fetchCache.once(...)` calls still work.

- **Custom stores**

  Custom stores should expect `FMCCacheContent.request.url` and
  `FMCCacheContent.request.headers` to already be redacted unless the user
  disables or customizes redaction. Store method signatures remain compatible.

- **Direction-specific header redaction**

  If replay behavior depends on a sensitive response header, such as
  `set-cookie` rebuilding a cookie jar, configure request and response headers
  independently. `redactRequestHeaders` and `redactResponseHeaders` override
  the shared `redactHeaders` option for their respective direction.

  ```ts
  const fetchCache = createFetchCache({
    Store,
    redactResponseHeaders: [
      "authorization",
      "proxy-authorization",
      "cookie",
      "x-api-key",
    ],
  });
  ```

- **Bug fixes that may affect tests**

  - Passing a `Request` object now preserves its method, headers, and body on
    cache misses.
  - Promise-valued `readCache` options are awaited before cache lookup.
  - Invalid JSON-labeled response bodies are stored as text instead of
    throwing during recording.
  - Cache hits no longer mutate the stored fixture content by adding
    `X-FMC-Cache`.
  - The Deno runtime adapter now reports `runtime.name` as `deno`.

## From v1 to v2

BREAKING CHANGES:

- **Module system**

  - v1: CommonJS
  - v2: ESM

- **Runtime and Test Framework support**

  - v1: Node + Jest only.
  - v2: Node (node:test, jest, vitest), Bun, Deno

- Rename header `X-JFMC-Cache` to `X-FMC-Cache`

- **Constructor** has a new convention for its name and arguments.

  ```diff
  - import createCachingMock from "fetch-mock-cache";
  + import fetchCache from "fetch-mock-cache";

  - const cachingMock = createCachingMock({ store: new Store() });
  + const fetchCache = createFetchCache({ Store });
  ```

- **Internal API changes**
  - Rename all classes, interfaces, types, from `JFMC*` to `FMC*`
  - Internal API change efdf25b7b0a2e6ba6571c74ef022a5820cd09b8c,
    affects alternative Storage classes.
