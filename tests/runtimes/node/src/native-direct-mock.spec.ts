"use strict";
import { describe, test } from "node:test";
import { expect } from "expect";

// import createFetchCache from "fetch-mock-cache"
// import MemoryStore from "fetch-mock-cache/stores/memory";
import createFetchCache from "../../../../src/runtimes/node.js";
import FsStore from "../../../../src/stores/fs.js";
import MemoryStore from "../../../../src/stores/memory.js";

describe("node:test - direct mock", () => {
  const url = "https://echo.free.beeceptor.com/?one=two&key=value";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async (t) => {
    const fetchCache = createFetchCache({ Store: MemoryStore });
    t.mock.method(globalThis, "fetch", fetchCache);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }
  });

  // NB, this is ONLY in native-direct-mock.spec.ts, because we only need to
  // test once for node.
  test("fs store", async (t) => {
    const fetchCache = createFetchCache({ Store: FsStore });
    t.mock.method(globalThis, "fetch", fetchCache);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }
  });
});
