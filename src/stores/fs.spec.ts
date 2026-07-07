import { describe, test as it } from "node:test";
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
});


