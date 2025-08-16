import { describe, test as it } from "node:test";
import { expect } from "expect";

import createFetchCache from "./runtimes/node.js";
// import FsStore from "./stores/nodeFs.js";
import MemoryStore from "./stores/memory.js";

const fetchCache = createFetchCache({ Store: MemoryStore });

describe("fetch-mock-cache", () => {
  describe("createFetchCache", () => {
    it("should throw if no store is provided", () => {
      expect(() => createFetchCache()).toThrow(
        /No `Store` option was provided/,
      );
    });
  });

  describe("created fetchCache", () => {
    it("should throw if no url is provided", async (t) => {
      t.mock.method(globalThis, "fetch", fetchCache);
      // @ts-expect-error: intentionally passing undefined to test runtime type checks
      await expect(fetch()).rejects.toThrow(/urlOrRequest is undefined/);
    });

    it("should pass options to store methods", async (t) => {
      const fetchCache = createFetchCache({ Store: MemoryStore });
      t.mock.method(globalThis, "fetch", fetchCache);

      const store = fetchCache._store! as MemoryStore;
      const fetchContent = (store.fetchContent = t.mock.fn(store.fetchContent));

      // Baseline, no opts
      await fetch("http://www.example.com/");
      let optionsArg = fetchContent.mock.calls[0].arguments[1];
      expect(Object.getOwnPropertyNames(optionsArg)).toHaveLength(0);

      // fetchCache._options = [{ id: "id" }];
      fetchCache._once({ id: "id" });
      await fetch("http://www.example.com/");
      optionsArg = fetchContent.mock.calls[1].arguments[1];
      expect(optionsArg).toMatchObject({ id: "id" });

      // Now let's make sure the options are cleared
      await fetch("http://www.example.com/");
      optionsArg = fetchContent.mock.calls[2].arguments[1];
      expect(Object.getOwnPropertyNames(optionsArg)).toHaveLength(0);
    });
  });
});
