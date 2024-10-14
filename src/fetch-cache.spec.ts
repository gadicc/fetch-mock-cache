import { describe, test as it } from "node:test";
import { expect } from "expect";

import createCachingMock from "./runtimes/node.js";
// import FsStore from "./stores/nodeFs.js";
import MemoryStore from "./stores/memory.js";

const fetchCache = createCachingMock({ Store: MemoryStore });

describe("fetch-mock-cache", () => {
  describe("createCachingMock", () => {
    it("should throw if no store is provided", () => {
      expect(() => createCachingMock()).toThrow(
        /No `Store` option was provided/,
      );
    });
  });

  describe("created mock", () => {
    it("should throw if no url is provided", async (t) => {
      t.mock.method(globalThis, "fetch", fetchCache);
      // @ts-expect-error: intentionally passing undefined to test runtime type checks
      await expect(fetch()).rejects.toThrow(/urlOrRequest is undefined/);
    });
  });
});
