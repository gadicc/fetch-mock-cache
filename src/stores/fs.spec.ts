import { describe, before } from "node:test";
import fs from "fs/promises";

import createCachingMock from "../runtimes/node.js";
import FsStore from "./fs.js";
import { createTestsForMock } from "../testUtils.js";

const nodeFsCacheMock = createCachingMock({ store: new FsStore() });

describe("fsStore", () => {
  describe("standard tests", () => {
    before(async () => {
      await fs.rm("./tests/fixtures/http", { force: true, recursive: true });
    });
    createTestsForMock(nodeFsCacheMock);
  });
});
