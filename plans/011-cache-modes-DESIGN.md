# Design Spike: First-Class Cache Modes

This document details the architectural design and API proposal for first-class cache modes in `fetch-mock-cache`.

## 1. Mode Semantics Table

The proposed cache modes are built on top of the existing `readCache` and `writeCache` primitives. The table below outlines how each mode configures these primitives, how it handles cache misses, and its intended use case.

| Mode | `readCache` | `writeCache` | On cache miss | Intended Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **`auto`** *(default)* | `true` | `true` | Fetch from network and write to cache | Standard development flow (default behavior) |
| **`replay`** | `true` | `false` | **Throw Error** (No network fetch) | CI environments: enforces fully offline test execution |
| **`record`** | `false` | `true` | Fetch from network and write to cache | Refreshing existing cache fixtures |
| **`off`** | `false` | `false` | Fetch from network, do not cache | Bypassing the mock completely (e.g. debugging) |

### Throw on Miss Behavior (Replay Mode)
The "throw on miss" behavior is a new capability that prevents tests from silently calling external APIs when a fixture is missing or expired. In `replay` mode, if a request does not match any cached content (i.e. `existingContent` is `null`), the mock will immediately throw an error before initiating any network request.

---

## 2. API Surface Proposal

We propose the following API and configuration mechanisms to control the cache mode.

### Default Options in factory
Users can configure a default cache mode when creating the fetch cache:
```ts
const fetchCache = createFetchCache({
  Store,
  mode: "replay", // default options
});
```

### Precedence Rules
Precedence is evaluated from highest to lowest:
1. **`once(options)` Overrides**: Calling `fetchCache.once({ readCache: false })` or `fetchCache.once({ mode: "record" })` overrides any defaults.
2. **Global Option**: `createFetchCache({ mode })` option or setting `fetchCache._options.mode` dynamically.
3. **Environment Variable**: The `FMC_CACHE_MODE` environment variable.
4. **Library Default**: `"auto"`.

### Environment Variable Integration
- **Name**: `FMC_CACHE_MODE` (or fallback to `FETCH_CACHE` for compatibility).
- **Casing**: Case-insensitive (e.g. `REPLAY` and `replay` are treated identically).
- **Invalid Value Behavior**: If an invalid mode is specified (e.g. `FMC_CACHE_MODE=invalid`), the library will log a warning and fall back to the default (`"auto"`).

#### Resolving the `Runtime.env` Snapshot Issue
In Node.js, `Runtime.env` is currently snapshotted during module initialization:
```ts
export const runtime: Runtime = {
  name: "node",
  env: { ...process.env }, // snapshotted
  ...
};
```
This prevents tests from dynamically modifying `process.env.FMC_CACHE_MODE` after import. To resolve this, we will use a **getter** on the runtime definition:
```ts
export const runtime: Runtime = {
  name: "node",
  get env() {
    return process.env;
  },
  ...
};
```
This is fully backward-compatible with the `Record<string, string | undefined>` interface and ensures dynamic environment changes are resolved correctly at runtime.

### "Recache Failing Tests" Recipe
The README currently details a recipe using `FETCH_CACHE="recache"` to rewrite the cache only when a test fails.
We propose keeping this as a **recipe** (or test-runner hook wrapper) rather than a built-in mode because determining if a test failed is test-runner specific (Jest vs. Vitest vs. Node:test) and cannot be robustly done within the library's agnostic fetch interceptor. However, we can simplify the wrapper in the docs using the new `mode` option.

---

## 3. Compatibility & Integration Analysis

- **Default Behavior**: The default mode remains `"auto"`, matching the current behavior exactly to ensure zero breaking changes for existing packages.
- **Error Formatting on Replay Miss**:
  When `replay` mode encounters a cache miss, it should surface a detailed error:
  ```
  fetch-mock-cache: cache miss in replay mode for request: GET https://fmc.test/endpoint
  - Store: FMCFileSystemStore (location: tests/fixtures/http)
  - Computed Cache ID: 1a2b3c4
  - To record this fixture, run with: FMC_CACHE_MODE=record
  ```

---

## 4. Open Questions

1. **Should `replay` mode fail if there are unused fixtures?**
   - *Recommendation*: No. A test suite might only call a subset of cached APIs depending on the test file. Enforcing zero unused fixtures increases maintenance overhead without adding runtime safety.
2. **Should mode be configurable per-store or per-mock?**
   - *Recommendation*: Per-mock. Cache modes represent global execution states of the test suite (e.g. "we are running in CI, do not hit network"), which aligns best with the mock fetch instance.

---

## 5. Effort Estimate

- **Implementation**: ~1 day (adding options checking, mode mapping, error throwing on miss, getter in runtimes).
- **Documentation**: ~0.5 day (updating README.md to document the new modes).
- **Verification/Tests**: ~0.5 day (adding unit tests for all modes and precedence rules).
- **Total Estimated Effort**: **2 days (Small/Medium)**.
