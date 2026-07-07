"use strict";
import { describe, test } from "node:test";
import { expect } from "expect";
import fetchMock from "fetch-mock";

import createFetchCache from "fetch-mock-cache";
import MemoryStore from "fetch-mock-cache/stores/memory";

describe("node:test - fetch-mock", () => {
  const expectedResponse = { one: "two", key: "value" };
  const fetchFixture: typeof fetch = async () =>
    new Response(JSON.stringify({ parsedQueryParams: expectedResponse }), {
      headers: { "content-type": "application/json" },
    });
  const fetchCache = createFetchCache({
    Store: MemoryStore,
    fetch: fetchFixture,
  });
  const url = "https://example.test/?one=two&key=value";

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
