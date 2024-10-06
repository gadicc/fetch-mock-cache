"use strict";
import { describe, test } from "node:test";
import { expect } from "expect";

// import createCachingMock from "fetch-mock-cache"
// import FMCMemoryStore from "fetch-mock-cache/stores/memory";
import createCachingFetch from "../../../../src/index.js";
import FMCMemoryStore from "../../../../src/stores/memory.js";

describe("node:test - direct mock", () => {
  const fetchCache = createCachingFetch({ store: new FMCMemoryStore() });
  const url = "http://echo.jsontest.com/key/value/one/two";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async (t) => {
    for (let i = 0; i < 2; i++) {
      t.mock.method(globalThis, "fetch", fetchCache);
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-JFMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }
  });
});
