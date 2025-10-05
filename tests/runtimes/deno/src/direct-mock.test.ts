"use strict";
// biome-ignore assist/source/organizeImports: organized by hand
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { spy } from "@std/testing/mock";

import createFetchCache from "@gadicc/fetch-mock-cache/runtimes/deno.ts";
import FsStore from "@gadicc/fetch-mock-cache/stores/fs.ts";
import MemoryStore from "@gadicc/fetch-mock-cache/stores/memory.ts";

describe("deno - direct mock", () => {
  const url = "https://echo.free.beeceptor.com/?one=two&key=value";
  const expectedResponse = { one: "two", key: "value" };

  it("memoryStore", async () => {
    const fetchCache = createFetchCache({ Store: MemoryStore });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = spy(fetchCache);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }

    globalThis.fetch = originalFetch;
  });

  it("fs store", async () => {
    const fetchCache = createFetchCache({ Store: FsStore });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = spy(fetchCache);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }

    globalThis.fetch = originalFetch;
  });
});
