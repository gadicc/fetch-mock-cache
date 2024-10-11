"use strict";
import { expect, describe, test, mock } from "bun:test";

// import createFetchCache from "fetch-mock-cache/runtimes/bun.js"
// import FMCMemoryStore from "fetch-mock-cache/stores/memory.js";
import createFetchCache from "../../../../src/runtimes/bun.js";
import MemoryStore from "../../../../src/stores/memory.js";
import FsStore from "../../../../src/stores/fs.js";

describe("bun:test - direct mock", () => {
  const url = "http://echo.jsontest.com/key/value/one/two";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async () => {
    const fetchCache = createFetchCache({ Store: MemoryStore });
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

  test("fs store", async () => {
    const fetchCache = createFetchCache({ Store: FsStore });
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
