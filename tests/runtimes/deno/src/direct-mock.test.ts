"use strict";
import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";

// import createCachingMock from "fetch-mock-cache"
// import FMCMemoryStore from "fetch-mock-cache/stores/memory";
import createCachingFetch from "../../../../src/index.ts";
import FMCMemoryStore from "../../../../src/stores/memory.ts";

describe("node:test - direct mock", () => {
  const fetchCache = createCachingFetch({ store: new FMCMemoryStore() });
  const url = "http://echo.jsontest.com/key/value/one/two";
  const expectedResponse = { one: "two", key: "value" };

  it("memoryStore", async () => {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }
  });
});
