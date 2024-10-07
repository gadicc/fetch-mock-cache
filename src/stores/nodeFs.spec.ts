import { describe, before } from "node:test";
import fs from "fs/promises";

import { createCachingMock } from "../index.js";
import nodeFsStore from "./nodeFs.js";
import { createTestsForMock } from "../testUtils.js";

const nodeFsCacheMock = createCachingMock({ store: new nodeFsStore() });

describe("nodeFsStore", () => {
  describe("standard tests", () => {
    before(async () => {
      await fs.rm("./tests/fixtures/http", { force: true, recursive: true });
    });
    createTestsForMock(nodeFsCacheMock);
  });
});
