"use strict";
import { describe, test, expect, vi } from "vitest";
import createFetchMock from "vitest-fetch-mock";

// import createFetchCache from "fetch-mock-cache"
// import FMCMemoryStore from "fetch-mock-cache/stores/memory";
import createFetchCache from "../../../../src/runtimes/node.js";
import MemoryStore from "../../../../src/stores/memory.js";

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();

describe("jest-fetch-mock", () => {
  const fetchCache = createFetchCache({ Store: MemoryStore });
  const url = "http://echo.jsontest.com/key/value/one/two";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async () => {
    for (let i = 0; i < 2; i++) {
      fetchMock.mockImplementationOnce(fetchCache);
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }
  });
});