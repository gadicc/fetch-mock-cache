"use strict";
import { describe, test, expect, vi } from "vitest";

// import createCachingMock from "fetch-mock-cache"
// import FMCMemoryStore from "fetch-mock-cache/stores/memory";
// @ts-expect-error: .js
import createCachingFetch from "../../../../src/index";
// @ts-expect-error: .js
import FMCMemoryStore from "../../../../src/stores/memory";

describe("vitest-fetch-mock", () => {
  const fetchCache = createCachingFetch({ store: new FMCMemoryStore() });
  const url = "http://echo.jsontest.com/key/value/one/two";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async () => {
    vi.stubGlobal("fetch", fetchCache);
    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }
    vi.unstubAllGlobals();
  });
});