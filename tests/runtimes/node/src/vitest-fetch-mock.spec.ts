"use strict";
// biome-ignore assist/source/organizeImports: organized by hand
import { describe, expect, test, vi } from "vitest";
import createFetchMock from "vitest-fetch-mock";

import createFetchCache from "fetch-mock-cache";
import MemoryStore from "fetch-mock-cache/stores/memory";

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();

describe("jest-fetch-mock", () => {
  const fetchCache = createFetchCache({ Store: MemoryStore });
  const url = "https://echo.free.beeceptor.com/?one=two&key=value";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async () => {
    for (let i = 0; i < 2; i++) {
      fetchMock.mockImplementationOnce(fetchCache);
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }
  });
});
