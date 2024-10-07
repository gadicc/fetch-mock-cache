"use strict";
import { describe, test, expect } from "@jest/globals";
import _fetchMock from "jest-fetch-mock";

// import createCachingMock from "fetch-mock-cache"
// import FMCMemoryStore from "fetch-mock-cache/stores/memory";
// @ts-expect-error: .js
import createCachingFetch from "../../../../src/index";
// @ts-expect-error: .js
import FMCMemoryStore from "../../../../src/stores/memory";

const fetchMock = _fetchMock.default;
fetchMock.enableMocks();

describe("jest-fetch-mock", () => {
  const fetchCache = createCachingFetch({ store: new FMCMemoryStore() });
  const url = "http://echo.jsontest.com/key/value/one/two";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async () => {
    for (let i = 0; i < 2; i++) {
      // If you get a TypeError here, make sure @types/jest is instaled.
      fetchMock.mockImplementationOnce(fetchCache);
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }
  });
});
