---
name: fetch-mock-cache
description: Use the fetch-mock-cache TypeScript package to add cached fetch fixtures to tests. Use when Codex needs to install, configure, or debug fetch-mock-cache in Node, Deno, Bun, node:test, Jest, Vitest, fetch-mock, jest-fetch-mock, or vitest-fetch-mock projects; convert live fetch tests into record/replay fixtures; choose fs or memory stores; set cache modes; refresh fixtures; or protect cached HTTP data from secrets.
---

# Fetch Mock Cache

## Overview

Help agents use `fetch-mock-cache` as a cached `fetch` implementation for test
suites. Prefer making real requests once, storing deterministic fixtures, and
running later tests from cache.

## Workflow

1. Identify the runtime and test runner before writing imports or mocks.
2. Install the package as a test/dev dependency for Node or Bun projects. For
   Deno, import from JSR as `jsr:@gadicc/fetch-mock-cache/...` unless the
   project already has an import map.
3. Choose the runtime entry point:
   - Node: `fetch-mock-cache` or `fetch-mock-cache/runtimes/node`.
   - Bun: `fetch-mock-cache/runtimes/bun.js`.
   - Deno: `jsr:@gadicc/fetch-mock-cache/runtimes/deno.ts`.
4. Choose a store:
   - Use `fetch-mock-cache/stores/fs` for durable fixtures that should be
     reviewed and committed. It defaults to `tests/fixtures/http`.
   - Use `fetch-mock-cache/stores/memory` for ephemeral tests that do not need
     committed fixtures.
   - Pass store options as `Store: [FsStore, { location: "path/to/fixtures" }]`
     when the fixture directory should differ from the default.
5. Create `const fetchCache = createFetchCache({ Store })`, then wire it into
   the test runner by stubbing `globalThis.fetch`, using the runner's mock API,
   or passing it to an existing fetch mock library.
6. Restore global mocks after each test or suite when the test framework does
   not do that automatically.
7. Assert `response.headers.get("X-FMC-Cache")` only when the test needs to
   verify cache behavior. Expect `MISS` for a recorded network request and
   `HIT` for a cache replay.

Read [runtime-examples.md](references/runtime-examples.md) when writing actual
setup code for Node, Jest, Vitest, Deno, Bun, or fetch mock adapters.

## Cache Modes

Use cache modes deliberately:

- `auto`: read from cache, otherwise fetch from the network and write a
  fixture. This is the default local development mode.
- `replay`: read from cache and throw on cache miss before any network request.
  Prefer this in CI once fixtures are recorded.
- `record`: skip cache reads, fetch from the network, and overwrite fixtures.
  Use this to refresh stale fixtures.
- `off`: fetch from the network without reading or writing cache.

Set modes with a constructor option, `fetchCache.options = { mode: "replay" }`,
a single-call `fetchCache.once({ mode: "record" })`, or the environment
variable `FMC_CACHE_MODE`. Precedence is `once()`, then `fetchCache.options`,
then `FMC_CACHE_MODE`, then `auto`.

## Fixture Safety

Review every filesystem fixture diff before committing.

`fetch-mock-cache` redacts common sensitive request and response headers plus
request query parameters before deriving cache keys and writing fixture JSON.
Use `redactRequestHeaders` and `redactResponseHeaders` when replay requires a
different policy in each direction, such as preserving response `set-cookie`
headers to rebuild a cookie jar. It does not redact request or response bodies,
and it cannot reliably detect secrets in URL path segments. For those cases,
avoid recording sensitive values, sanitize the code under test, or use
`fetchCache.once({ id: "stable-safe-name" })` so the filename does not contain
the secret-bearing URL.

For CI, set `FMC_CACHE_MODE=replay` after fixtures are committed so missing
fixtures fail loudly instead of making live network requests.

## Custom Stores

Create a custom store only when `stores/fs` or `stores/memory` is not enough.
Extend `FMCStore` from `fetch-mock-cache/store`, implement `fetchContent` and
`storeContent`, and override `idFromRequest` only when the default keying is not
appropriate.

Keep custom store code small and covered by tests because it defines fixture
lookup, persistence, and cache miss behavior.
