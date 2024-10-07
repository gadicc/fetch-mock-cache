import { describe, test as it } from "node:test";
import { expect } from "expect";

import { createCachingMock } from "./index.js";
// import FMCNodeFSStore from "./stores/nodeFs.js";
import FMCMemoryStore from "./stores/memory.js";

const fetchCache = createCachingMock({ store: new FMCMemoryStore() });

describe("fetch-mock-cache", () => {
  describe("createCachingMock", () => {
    it("should throw if no store is provided", () => {
      expect(() => createCachingMock()).toThrow(
        /No `store` option was provided/,
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
