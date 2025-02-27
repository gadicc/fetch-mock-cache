"use strict";
import { describe, test, expect, jest } from "@jest/globals";

// import createFetchCache from "fetch-mock-cache"
// import MemoryStore from "fetch-mock-cache/stores/memory";
import createFetchCache from "../../../../src/runtimes/node.js";
import MemoryStore from "../../../../src/stores/memory.js";

describe("jest-fetch-mock", () => {
  const fetchCache = createFetchCache({ Store: MemoryStore });
  const url = "https://echo.free.beeceptor.com/?one=two&key=value";
  const expectedResponse = { one: "two", key: "value" };
  const origFetch = global.fetch;

  test("memoryStore", async () => {
    global.fetch = jest.fn(fetchCache);
    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }
    global.fetch = origFetch;
  });
});
