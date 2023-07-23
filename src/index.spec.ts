import fetchMock from "jest-fetch-mock";
fetchMock.enableMocks();

import { describe, expect, test as it } from "@jest/globals";
import createCachingMock from "./index";
// import JFMCNodeFSStore from "./stores/nodeFs";
import JSMCMemoryStore from "./stores/memory";

const memoryCacheMock = createCachingMock({ store: new JSMCMemoryStore() });

describe("jest-fetch-mock-cache", () => {
  describe("createCachingMock", () => {
    it("should throw if no store is provided", () => {
      expect(() => createCachingMock()).toThrow(
        /No `store` option was provided/,
      );
    });
  });

  describe("created mock", () => {
    it("should throw if no url is provided", async () => {
      fetchMock.mockImplementationOnce(memoryCacheMock);
      // @ts-expect-error: intentionally passing undefined to test runtime type checks
      await expect(fetch()).rejects.toThrow(/urlOrRequest is undefined/);
    });

    it("works with a Request as first argument", async () => {
      const url = "http://echo.jsontest.com/id/test1";
      const expectedResponse = { id: "test1" };
      fetchMock.mockImplementationOnce(memoryCacheMock);
      const data = await (await fetch(new Request(url))).json();
      expect(data).toEqual(expectedResponse);
    });

    it("works with text response (non-JSON)", async () => {
      const url =
        "https://echoserver.dev/server?query=%7B%22headers%22%3A%5B%5D%2C%22body%22%3A%7B%22type%22%3A%22text%22%2C%22data%22%3A%22hello%22%7D%2C%22status%22%3A200%7D";
      const expectedResponse = "hello";

      for (let i = 0; i < 2; i++) {
        fetchMock.mockImplementationOnce(memoryCacheMock);
        const response = await fetch(url);
        const data = await response.text();
        const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
        expect(response.headers.get("X-JFMC-Cache")).toBe(expectedCacheHeader);
        expect(data).toBe(expectedResponse);
      }
    });

    it("works with a JSON response", async () => {
      const url = "http://echo.jsontest.com/key/value/one/two";
      const expectedResponse = { one: "two", key: "value" };

      for (let i = 0; i < 2; i++) {
        fetchMock.mockImplementationOnce(memoryCacheMock);
        const response = await fetch(url);
        const data = await response.json();
        const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
        expect(response.headers.get("X-JFMC-Cache")).toBe(expectedCacheHeader);
        expect(data).toEqual(expectedResponse);
      }
    });
  });
});
