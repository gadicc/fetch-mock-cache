import { describe, test as it } from "node:test";
import fs from "fs/promises";
import { expect } from "expect";

import createFetchCache from "../runtimes/node.js";
import { createTestsForMock, createFakeFetch } from "../testUtils.js";
import FsStore from "./fs.js";

const location = `coverage/fmc-test-temp-${Math.random().toString(36).slice(2)}`;
const nodeFsCacheMock = createFetchCache({
  Store: [FsStore, { location }],
  fetch: createFakeFetch(),
});

describe("fsStore", () => {
  describe("standard tests", () => {
    createTestsForMock(nodeFsCacheMock);
  });

  describe("committed fixtures", () => {
    const mock = createFetchCache({
      Store: FsStore, // default location: tests/fixtures/http
      fetch: async () => {
        throw new Error("network fetch attempted — fixture should have HIT");
      },
    });

    it("serves a HIT from a committed fixture", async (t) => {
      t.mock.method(globalThis, "fetch", mock);
      const response = await fetch("https://fmc.test/text");
      const data = await response.text();
      expect(response.headers.get("X-FMC-Cache")).toBe("HIT");
      expect(data).toBe("hello");
    });
  });

  describe("error handling", () => {
    const store = nodeFsCacheMock._store! as FsStore;

    it("missing file returns null (cache miss)", async () => {
      const request = {
        url: "https://fmc.test/does-not-exist",
        method: "GET",
      };
      const content = await store.fetchContent(request);
      expect(content).toBeNull();
    });

    it("corrupt file throws a helpful error", async () => {
      const request = {
        url: "https://fmc.test/corrupt-json",
        method: "GET",
      };
      const path = await store.pathFromRequest(request);
      const pathParts = path.split("/");
      pathParts.pop();
      await fs.mkdir(pathParts.join("/"), { recursive: true });
      await fs.writeFile(path, "{ not json");

      await expect(store.fetchContent(request)).rejects.toThrow(
        /cache file exists but is not valid JSON/,
      );
    });
  });
});


