# Runtime and Framework Examples

Use these examples as starting points, then match the target project's test
style, assertion library, and setup/teardown conventions.

## Install

```bash
pnpm add -D fetch-mock-cache
```

Use the project's package manager instead of `pnpm` when it already standardizes
on npm, yarn, or bun. Deno projects can import from JSR directly:
`jsr:@gadicc/fetch-mock-cache/...`.

## Node with node:test

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import createFetchCache from "fetch-mock-cache/runtimes/node";
import FsStore from "fetch-mock-cache/stores/fs";

test("uses cached fetch", async (t) => {
  const fetchCache = createFetchCache({ Store: FsStore });
  t.mock.method(globalThis, "fetch", fetchCache);

  const first = await fetch("https://example.com/api/data");
  assert.equal(first.headers.get("X-FMC-Cache"), "MISS");

  const second = await fetch("https://example.com/api/data");
  assert.equal(second.headers.get("X-FMC-Cache"), "HIT");
});
```

## Jest Direct Mock

```ts
import { afterEach, jest, test, expect } from "@jest/globals";
import createFetchCache from "fetch-mock-cache";
import MemoryStore from "fetch-mock-cache/stores/memory";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

test("uses cached fetch", async () => {
  const fetchCache = createFetchCache({ Store: MemoryStore });
  global.fetch = jest.fn(fetchCache);

  const response = await fetch("https://example.com/api/data");
  expect(response.headers.get("X-FMC-Cache")).toBe("MISS");
});
```

## Vitest Direct Mock

```ts
import { afterEach, expect, test, vi } from "vitest";
import createFetchCache from "fetch-mock-cache";
import FsStore from "fetch-mock-cache/stores/fs";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("uses cached fetch", async () => {
  const fetchCache = createFetchCache({ Store: FsStore });
  vi.stubGlobal("fetch", fetchCache);

  const response = await fetch("https://example.com/api/data");
  expect(response.headers.get("X-FMC-Cache")).toBe("MISS");
});
```

## Deno

```ts
import { assertEquals } from "jsr:@std/assert";
import { spy } from "jsr:@std/testing/mock";
import createFetchCache from "jsr:@gadicc/fetch-mock-cache/runtimes/deno.ts";
import FsStore from "jsr:@gadicc/fetch-mock-cache/stores/fs.ts";

Deno.test("uses cached fetch", async () => {
  const fetchCache = createFetchCache({ Store: FsStore });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = spy(fetchCache);

  try {
    const response = await fetch("https://example.com/api/data");
    assertEquals(response.headers.get("X-FMC-Cache"), "MISS");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

## Bun

```ts
import { describe, expect, mock, test } from "bun:test";
import createFetchCache from "fetch-mock-cache/runtimes/bun.js";
import FsStore from "fetch-mock-cache/stores/fs.js";

describe("fetch cache", () => {
  test("uses cached fetch", async () => {
    const fetchCache = createFetchCache({ Store: FsStore });
    const originalFetch = global.fetch;
    global.fetch = mock(fetchCache);

    try {
      const response = await fetch("https://example.com/api/data");
      expect(response.headers.get("X-FMC-Cache")).toBe("MISS");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
```

## Existing Fetch Mock Libraries

If the project already uses `fetch-mock`, route requests to the cache:

```ts
import fetchMock from "fetch-mock";
import createFetchCache from "fetch-mock-cache";
import MemoryStore from "fetch-mock-cache/stores/memory";

const fetchCache = createFetchCache({ Store: MemoryStore });
fetchMock.mock("*", fetchCache);
```

If the project already uses `jest-fetch-mock` or `vitest-fetch-mock`, register
the cache per call:

```ts
fetchMock.mockImplementationOnce(fetchCache);
```

## Cache Controls

```ts
const fetchCache = createFetchCache({
  Store: [FsStore, { location: "tests/fixtures/http" }],
  mode: "replay",
});

fetchCache.options = { mode: "record" };
fetchCache.once({ id: "stable-fixture-name", mode: "auto" });
```

Use `FMC_CACHE_MODE=replay` in CI and `FMC_CACHE_MODE=record` when intentionally
refreshing all fixtures in a run.
