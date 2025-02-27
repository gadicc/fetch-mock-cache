"use strict";
import { describe, test, expect, vi } from "vitest";

// import createFetchCache from "fetch-mock-cache"
// import FMCMemoryStore from "fetch-mock-cache/stores/memory";
import createFetchCache from "../../../../src/runtimes/node.js";
import MemoryStore from "../../../../src/stores/memory.js";

describe("vitest-fetch-mock", () => {
  const fetchCache = createFetchCache({ Store: MemoryStore });
  const url = "https://echo.free.beeceptor.com/?one=two&key=value";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async () => {
    vi.stubGlobal("fetch", fetchCache);
    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }
    vi.unstubAllGlobals();
  });
});
