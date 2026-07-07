# Design Spike: Browser and JSDOM Support

This document details the compatibility, architecture, and design options for running `fetch-mock-cache` in browser environments and browser-simulated environments (like JSDOM).

## 1. Demand Check

A survey of issues in `gadicc/fetch-mock-cache` and its predecessor `jest-fetch-mock-cache` indicates very low explicit demand for browser-specific runtime support:
- No open or closed issues exist requesting support for running the mock in a real browser (e.g., Vitest browser mode or Playwright component testing).
- JSDOM-related queries are typically resolved by using the standard Node.js runtime since JSDOM runs inside a Node process.
- The default recommendation for modern browser-like integration/network boundary testing remains **Mock Service Worker (MSW)**.

*Recommendation*: Retain the TODO list item in the README but clarify that it is mostly for JSDOM support or real browser test runner configurations.

---

## 2. Environment Matrix

### JSDOM under Jest/Vitest (Node process)
- **Status**: Works out of the box today!
- **Reasoning**: JSDOM runs inside Node.js. Although JSDOM mocks browser APIs (like `document` and `window`), the Node.js global context (including `process`, `fs`, and `crypto`) is fully accessible. Thus, the existing `fetch-mock-cache/runtimes/node` adapter can be used directly with the `FMCFileSystemStore`.
- **Note**: The user must polyfill or enable `fetch` if their older Jest/Node version does not have global `fetch` enabled.

### Real Browser (Vitest Browser Mode / Playwright Component Testing)
- **Status**: Requires a dedicated browser adapter.
- **Reasoning**: Real browsers do not expose Node's `fs`, `path`, or `process`.
- **Required Adaptations**:
  - `sha256`: Fully portable using web-standard `crypto.subtle.digest("SHA-256", ...)` (identical to the Deno implementation in `src/runtimes/deno.ts`).
  - `env`: Can read from a global config object or fall back to an empty object.
  - `fs`, `path`, `cwd`: Stubbed out (returns empty/throws) because a real browser cannot write to the host filesystem directly.

---

## 3. Store Options for Browsers

If running in a real browser, the `FMCFileSystemStore` cannot be used. We have three design paths:

1. **Memory Store (Default/Available Today)**:
   - *Pros*: Zero dependencies, works in browsers today.
   - *Cons*: No persistence. Cache is reset on page refresh or test reload.
2. **IndexedDB / Origin Private File System (OPFS) Store**:
   - *Pros*: Persists across refreshes within a browser profile.
   - *Cons*: High implementation overhead, does not easily commit to the Git repository (violates the core "commit fixtures to git" value proposition of the library).
3. **HTTP-backed Server-Proxy Store**:
   - *Pros*: Interacts with a local dev server to read/write fixtures to the host disk. Fully preserves the Git-committed workflow.
   - *Cons*: Requires running a helper server process alongside the test runner.

*Recommendation*: For real browser testing, the Memory Store is sufficient for single-run mocks. If persistence/git-fixtures are needed, MSW is a superior tool. We do not recommend building a complexIndexedDB/HTTP store.

---

## 4. Packaging Implications

A browser entry point requires:
- Exposing a browser-compatible runtime adapter at `src/runtimes/browser.ts`.
- Exposing `fetch-mock-cache/runtimes/browser` inside `package.json#exports` and `jsr.json#exports`.
- Since we use a dual-publish structure, we must keep matching entries in export maps:
  - `package.json` -> pointing to `./lib/runtimes/browser.js`
  - `jsr.json` -> pointing to `./src/runtimes/browser.ts`

---

## 5. Recommendation & Effort Estimate

- **Recommendation**: **Docs-only + Smoke Test**. We should add a JSDOM environment smoke test under `tests/runtimes/` to ensure JSDOM works with the Node runtime without regressions, and document this setup in the README. We should not implement a dedicated browser runtime or browser store at this time due to lack of demand.
- **Coarse Build Effort (if smoke test + docs are implemented)**: **1 day (Small)**.
