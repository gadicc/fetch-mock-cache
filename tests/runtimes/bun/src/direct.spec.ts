"use strict";
import { expect, describe, test, mock } from "bun:test";

// import createCachingMock from "fetch-mock-cache/runtimes/bun.js"
// import FMCMemoryStore from "fetch-mock-cache/stores/memory.js";
import createCachingFetch from "../../../../src/runtimes/bun.js";
import FMCMemoryStore from "../../../../src/stores/memory.js";

describe("bun:test - direct mock", () => {
  const fetchCache = createCachingFetch({ store: new FMCMemoryStore() });
  const url = "http://echo.jsontest.com/key/value/one/two";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async () => {
    const origFetch = global.fetch;
    global.fetch = mock(fetchCache);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }

    global.fetch = origFetch;
  });
});
