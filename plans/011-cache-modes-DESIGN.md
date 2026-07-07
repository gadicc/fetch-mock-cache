# Design spike: first-class cache modes

This design adds run-level cache modes on top of the existing per-call `readCache` and `writeCache` options. The build should add `auto`, `replay`, `record`, and `off`, keep the default behavior unchanged, and make `replay` the CI-safe mode that never reaches the network on a cache miss.

## 1. Verification and prior art

The spike plan still lines up with the current code. The drift command `git diff --stat 16ce139..HEAD -- src/fetch-cache.ts src/runtimes README.md` shows changes in the touched areas, but the needed primitives still exist:

- `FetchCacheOptions.readCache` and `FetchCacheOptions.writeCache` are still defined in `src/fetch-cache.ts:45-65`
- the per-call option queue still resolves near `src/fetch-cache.ts:156-163`
- cached content is read at `src/fetch-cache.ts:192-193`
- cache hits return before the network at `src/fetch-cache.ts:195-205`
- network fetches start at `src/fetch-cache.ts:207-212`
- writes happen at `src/fetch-cache.ts:225-242`
- `Runtime.env` exists at `src/fetch-cache.ts:23-25`
- Node and Deno currently snapshot env at import time in `src/runtimes/node.ts:18` and `src/runtimes/deno.ts:19`; Bun reuses the Node runtime in `src/runtimes/bun.ts:12`

Prior-art mode names support a small explicit mode set, but the exact names should fit this package:

- Nock Back has `wild`, `dryrun`, `record`, `update`, and `lockdown`; the important expectations are pass-through, replay with optional network, re-record, and no-network replay
- Polly.js has `replay`, `record`, and `passthrough`; `recordIfMissing` controls whether replay can record misses
- Ruby VCR has `:once`, `:new_episodes`, `:none`, and `:all`; the important expectations are replay-only, replay-plus-record-new, no-network, and re-record-all

The proposed modes intentionally avoid copying a full prior-art matrix. `fetch-mock-cache` already exposes low-level per-call options, so the built-in modes should cover the common suite-level states.

## 2. Mode semantics table

Each mode maps to the existing read/write primitives, plus one new replay-only miss behavior:

| Mode | `readCache` default | `writeCache` default | Cache miss behavior | Intended use |
| :--- | :--- | :--- | :--- | :--- |
| `auto` | `true` | `true` | Fetch from network, then write to cache | Current default development flow |
| `replay` | `true` | `false` | Throw before network fetch | CI and fully offline test runs |
| `record` | `false` | `true` | Fetch from network, then write to cache | Refresh existing fixtures |
| `off` | `false` | `false` | Fetch from network, do not write | Debug the mock or bypass cache behavior |

`replay` needs new behavior. The implementation should resolve `readCache`, call `store.fetchContent(...)`, and then check for a miss after `src/fetch-cache.ts:192-193` and before `src/fetch-cache.ts:207`. If the effective mode is `replay`, effective `readCache` is `true`, and `existingContent` is `null` or `undefined`, throw before calling the configured `fetch`.

`record` means "do not read first." With the current fs store, that means the next network response overwrites the existing cache file for the same computed cache id. That matches the "refresh fixtures" use case.

## 3. API surface proposal

Add a mode type and allow it anywhere `FetchCacheOptions` are accepted. Also add `mode?: FetchCacheMode` to `CreateFetchCacheOptions`; the factory should copy it into `fetchCache.options` during initialization.

```typescript
export type FetchCacheMode = "auto" | "replay" | "record" | "off";

type ReadCacheOption =
  | boolean
  | Promise<boolean>
  | ((...args: Parameters<FMCStore["fetchContent"]>) => Promise<boolean>);

type WriteCacheOption =
  | boolean
  | Promise<boolean>
  | ((...args: Parameters<FMCStore["storeContent"]>) => Promise<boolean>);

export interface FetchCacheOptions {
  id?: string;
  mode?: FetchCacheMode;
  readCache?: ReadCacheOption;
  writeCache?: WriteCacheOption;
}
```

Add a public defaults object for suite-level options, and keep `_options` as the one-shot queue:

```typescript
const fetchCache = createFetchCache({
  Store,
  mode: "replay",
});

fetchCache.options = { mode: "record" };
fetchCache.once({ mode: "off" });
```

Do not use `fetchCache._options.mode` for global configuration. `_options` is currently an array consumed by `once()`, so putting global state there would make the mode disappear after one call or corrupt the one-shot queue.

Precedence is resolved per fetch call:

1. `fetchCache.once(...)` options
2. `fetchCache.options` or `createFetchCache({ mode })`
3. `runtime.env.FMC_CACHE_MODE`
4. built-in default `auto`

Resolve the final mode first, then expand it to default `readCache`, `writeCache`, and `throwOnMiss` values. Explicit `readCache` or `writeCache` values from higher-precedence options override the booleans from the mode. `throwOnMiss` only applies when the final mode is `replay` and effective `readCache` is not `false`.

## 4. Environment variable integration

Use `FMC_CACHE_MODE` as the only built-in environment variable. It is case-insensitive after trimming whitespace.

Do not fall back to `FETCH_CACHE`. The README already uses `FETCH_CACHE="recache"` for a userland recipe, and treating that variable as a mode creates an avoidable compatibility trap. Documentation can show users how to map legacy `FETCH_CACHE` values to `FMC_CACHE_MODE` in their test wrapper if they want that transition.

Only read `FMC_CACHE_MODE` when no one-shot or global mode is set. If the env var is set to an invalid value, throw a configuration error that lists the valid modes. Falling back to `auto` after an explicit invalid env value can let CI reach the network when the user expected replay.

`Runtime.env` should be read at fetch-call time, not at module import time:

```typescript
export const runtime: Runtime = {
  name: "node",
  get env() {
    return process.env;
  },
  // ...
};
```

Apply the same pattern across runtimes:

- Node returns `process.env`
- Bun inherits the Node runtime today, so the Node getter fixes Bun too
- Deno should use `get env() { return Deno.env.toObject(); }` so tests that mutate env after import can affect later fetches
- a future browser runtime can return `{}` or a documented global config object; no `process.env` assumption should leak into core code

## 5. Recache failing tests recipe

Keep "recache failing tests" as a recipe, not a built-in mode. The library cannot know whether a test failed without test-runner-specific hooks.

The recipe can become shorter by composing `record` mode with an async `writeCache` decision:

```typescript
if (process.env.FMC_RECACHE_ON_FAILURE === "1") {
  fetchCache.once({
    mode: "record",
    writeCache: onFinish.then((error) => Boolean(error)),
  });
}
```

Use a separate recipe env var such as `FMC_RECACHE_ON_FAILURE` in docs. That keeps `FMC_CACHE_MODE` reserved for first-class modes.

## 6. Compatibility and error format

The default must stay `auto`, which preserves the current behavior for existing users. Existing `once({ readCache, writeCache })` calls keep working because explicit one-shot options override mode defaults.

A replay miss error should include the request, store, computed cache id, and recording fix:

```text
fetch-mock-cache: cache miss in replay mode for GET https://fmc.test/endpoint
Store: FMCFileSystemStore (location: tests/fixtures/http)
Computed cache id: httpsfmc-testendpoint.json
To record this fixture, set FMC_CACHE_MODE=record or createFetchCache({ mode: "record" }).
```

The computed id should come from `store.idFromRequest(cacheContentRequest, options)` so custom stores and custom `id` values report the same identifier the store used. Store location can be included when the store exposes a string `_location` property; otherwise report only the constructor name.

## 7. Open questions

1. Should `replay` fail on unused fixtures?
   Recommendation: no. This package matches requests by cache id and does not track a cassette lifecycle. Failing on unused fixtures would add stateful suite coordination without improving the "no network in CI" guarantee.
2. Should mode be configurable per-store or per-fetch cache?
   Recommendation: per-fetch cache. Cache mode is execution policy, while stores should stay responsible for locating and serializing cache content.
3. Should invalid env values throw instead of warn?
   Recommendation: throw when `FMC_CACHE_MODE` is the selected mode source. An invalid value such as `FMC_CACHE_MODE=invalid` should fail before any request can reach the network.
4. Should `fetchCache.options` accept all `FetchCacheOptions` or only `mode`?
   Recommendation: accept all `FetchCacheOptions`. That resolves the existing "main options? merge?" TODO and lets advanced users set suite-level `readCache`, `writeCache`, or `id` behavior without another API.

## 8. Recommendation and effort estimate

Build this feature. The implementation is small, the current README already documents demand for run-level control, and `replay` gives CI a safety guarantee the current primitives cannot express.

Estimated build effort:

- Implementation: 1 day for mode parsing, option merging, replay miss errors, and runtime env getters
- Tests: 0.5 day for mode table behavior, precedence, env casing, invalid env errors, and Node/Deno env getter behavior
- Docs: 0.5 day to replace the README recache section and document `FMC_CACHE_MODE`
- Total: 2 days
