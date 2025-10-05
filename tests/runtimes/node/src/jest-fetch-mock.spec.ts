"use strict";
// biome-ignore assist/source/organizeImports: organized by hand
import _fetchMock from "jest-fetch-mock";
import { describe, expect, test } from "@jest/globals";

import createFetchCache from "fetch-mock-cache";
import MemoryStore from "fetch-mock-cache/stores/memory";

const fetchMock = _fetchMock.default;
fetchMock.enableMocks();

describe("jest-fetch-mock", () => {
  const fetchCache = createFetchCache({ Store: MemoryStore });
  const url = "https://echo.free.beeceptor.com/?one=two&key=value";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async () => {
    for (let i = 0; i < 2; i++) {
      // If you get a TypeError here, make sure @types/jest is instaled.
      fetchMock.mockImplementationOnce(fetchCache);
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }
  });
});
