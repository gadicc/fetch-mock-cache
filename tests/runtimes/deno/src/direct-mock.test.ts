"use strict";
import { describe, it } from "jsr:@std/testing/bdd";
import { spy } from "jsr:@std/testing/mock";
import { expect } from "jsr:@std/expect";

// import createFetchCache from "fetch-mock-cache/runtimes/deno.ts"
// import MemoryStore from "fetch-mock-cache/stores/memory.ts";
import createFetchCache from "../../../../src/runtimes/deno.ts";
import MemoryStore from "../../../../src/stores/memory.ts";
import FsStore from "../../../../src/stores/fs.ts";

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
