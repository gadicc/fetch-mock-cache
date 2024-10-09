"use strict";
import { describe, test, expect, jest } from "@jest/globals";

// import createCachingMock from "fetch-mock-cache"
// import FMCMemoryStore from "fetch-mock-cache/stores/memory";
// @ts-expect-error: .js
import createCachingFetch from "../../../../src/runtimes/node";
// @ts-expect-error: .js
import FMCMemoryStore from "../../../../src/stores/memory";

describe("jest-fetch-mock", () => {
  const fetchCache = createCachingFetch({ store: new FMCMemoryStore() });
  const url = "http://echo.jsontest.com/key/value/one/two";
  const expectedResponse = { one: "two", key: "value" };
  global.fetch = jest.fn(fetchCache);

  test("memoryStore", async () => {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }
  });
});
