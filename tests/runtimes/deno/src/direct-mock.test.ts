"use strict";
import { describe, it } from "jsr:@std/testing/bdd";
import { spy } from "jsr:@std/testing/mock";
import { expect } from "jsr:@std/expect";

// import createCachingMock from "fetch-mock-cache/runtimes/deno.ts"
// import FMCMemoryStore from "fetch-mock-cache/stores/memory.ts";
import createCachingFetch from "../../../../src/runtimes/deno.ts";
import FMCMemoryStore from "../../../../src/stores/memory.ts";

describe("deno - direct mock", () => {
  const fetchCache = createCachingFetch({ store: new FMCMemoryStore() });
  const url = "http://echo.jsontest.com/key/value/one/two";
  const expectedResponse = { one: "two", key: "value" };

  it("memoryStore", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = spy(fetchCache);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }

    globalThis.fetch = originalFetch;
  });
});
