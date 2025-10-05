"use strict";
import { describe, test } from "node:test";
import { expect } from "expect";
import fetchMock from "fetch-mock";

import createFetchCache from "fetch-mock-cache";
import MemoryStore from "fetch-mock-cache/stores/memory";

describe("node:test - fetch-mock", () => {
  const fetchCache = createFetchCache({ Store: MemoryStore });
  const url = "https://echo.free.beeceptor.com/?one=two&key=value";
  const expectedResponse = { one: "two", key: "value" };

  test("memoryStore", async () => {
    fetchMock.mock("*", fetchCache);
    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }
    fetchMock.reset();
  });
});
