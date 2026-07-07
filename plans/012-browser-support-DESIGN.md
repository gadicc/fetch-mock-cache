# Design spike: browser and jsdom support

This design keeps browser support as a documented boundary until demand appears or a smoke test proves the jsdom path. The current package is Node-first at the root entry point, so the follow-up should add documentation and a jsdom smoke test before it claims browser-like support.

## 1. Demand check

Live issue searches on 2026-07-07 found no explicit demand in either repository:

- `gh issue list --repo gadicc/fetch-mock-cache --state all --search browser --limit 20`: no rows
- `gh issue list --repo gadicc/fetch-mock-cache --state all --search jsdom --limit 20`: no rows
- `gh issue list --repo gadicc/fetch-mock-cache --state all --search "vitest browser" --limit 20`: no rows
- `gh issue list --repo gadicc/fetch-mock-cache --state all --search playwright --limit 20`: no rows
- `gh issue list --repo gadicc/jest-fetch-mock-cache --state all --search browser --limit 20`: no rows
- `gh issue list --repo gadicc/jest-fetch-mock-cache --state all --search jsdom --limit 20`: no rows
- `gh issue list --repo gadicc/jest-fetch-mock-cache --state all --search "vitest browser" --limit 20`: no rows
- `gh issue list --repo gadicc/jest-fetch-mock-cache --state all --search playwright --limit 20`: no rows

Recommendation: keep the README TODO, but reword it as an invitation for real browser runner cases. Do not build a browser runtime based on current demand.

## 2. Environment matrix

The environments split into jsdom in Node and real browser execution:

| Target | Current status | What breaks or needs proof | Follow-up |
| :--- | :--- | :--- | :--- |
| Jest or Vitest with jsdom | Plausible, not proven | The process still has Node APIs, but `fetch-cache.ts` captures `fetch` at module import. Some jsdom setups may not expose `fetch` before import. | Add a smoke test before documenting support |
| Real browser test runner | Not supported | The root export imports the Node runtime. Browsers do not expose Node `fs`, `path`, `cwd`, or `process.env`. | Build an explicit `runtimes/browser` entry only if demand appears |
| Service worker interception | Out of scope | This package wraps `fetch`; it does not install a service worker or intercept browser navigation/resource requests. | Recommend Mock Service Worker (MSW) for service-worker-style browser interception |

The current design should not say jsdom "works out of the box." A local check found the existing runtime fixture does not include `jsdom` or `jest-environment-jsdom`:

```text
npm ls jsdom
node@1.0.0 tests/runtimes/node
`-- (empty)
```

That means the required jsdom experiment from the spike plan has not been satisfied by the current repo. The next build should add a real smoke test before README docs claim support.

## 3. Runtime-interface audit

The `Runtime` interface requires `env`, `sha256`, `fs`, `path.join`, and `cwd` in `src/fetch-cache.ts:23-38`.

Store usage matters more than the runtime shape:

- `FMCStore.hash()` calls `runtime.sha256` in `src/store.ts:57-58`
- `FMCMemoryStore` only depends on the base store id generation and therefore needs `sha256`
- `FMCFileSystemStore` uses `runtime.path.join`, `runtime.cwd`, `runtime.fs.mkdir`, `runtime.fs.readFile`, and `runtime.fs.writeFile` in `src/stores/fs.ts:37-105`

A browser runtime can support `FMCMemoryStore` with web-standard `crypto.subtle.digest("SHA-256", ...)`, which matches the Deno hashing approach. It cannot make `FMCFileSystemStore` meaningful without a host-side helper process.

If a browser runtime is ever built, it should be explicit:

- `sha256`: use Web Crypto
- `env`: return `{}` or a documented global config object
- `fs`: throw clear "not available in browser runtime" errors
- `path.join`: provide a tiny URL/path join helper only for stores that need string joining
- `cwd`: return `"/"` or throw; `FMCFileSystemStore` should not be recommended in browsers

## 4. Store options for browsers

Real browser persistence has three possible store paths:

1. `FMCMemoryStore`
   - Pros: no new store implementation, enough for single-run component tests
   - Cons: loses cache on reload and cannot commit fixtures
2. IndexedDB or Origin Private File System (OPFS)
   - Pros: persists inside one browser profile
   - Cons: does not produce reviewable fixture files in the repo
3. HTTP-backed helper store
   - Pros: preserves committed fixture files by reading and writing through a local server
   - Cons: requires a server process and a new protocol between browser and host

Recommendation: do not build IndexedDB, OPFS, or HTTP-backed stores now. If real browser support gets requested, start with an explicit browser runtime plus `FMCMemoryStore`. Only build an HTTP-backed store if users need committed fixtures from browser-runner tests.

MSW is a better fit for service-worker-level browser interception. It is not a direct replacement for this package's committed-fixture workflow, so docs should frame it as a boundary, not as a superior fixture store.

## 5. Packaging implications

The root package entry point currently exports the Node runtime from `src/index.ts:1-4`. A browser build should not silently change the root export for existing users.

If a browser runtime is added, expose it explicitly in both publish maps:

- `package.json#exports`: `./runtimes/browser`, `./runtimes/browser.js`, and `./runtimes/browser.ts` should point at `./lib/runtimes/browser.js`
- `jsr.json#exports`: the same specifiers should point at `./src/runtimes/browser.ts`

Do not add a package-level `browser` condition until a bundler test proves it does not redirect Node users or break the Deno and Bun runtime entries.

## 6. Recommendation and effort estimate

Recommendation: docs and smoke test first. Do not implement a real browser runtime or browser store yet.

Follow-up work:

- Add a jsdom smoke test under `tests/runtimes/` that imports `fetch-mock-cache/runtimes/node`, uses `FMCFileSystemStore`, and records the exact fetch polyfill requirements
- If import fails because `fetch` is unavailable at module load, fix core to capture the default fetch lazily or document the required polyfill ordering
- Update the README TODO with the verified jsdom result and a real-browser boundary note

Estimated effort:

- jsdom smoke test and README note: 1 day
- Minimal browser runtime plus memory-store smoke test, if later accepted: 1 day
- HTTP-backed browser fixture store, if later requested: 3 to 5 days
