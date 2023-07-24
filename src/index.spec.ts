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
  });
});
