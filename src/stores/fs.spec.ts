import { before, describe } from "node:test";
import fs from "fs/promises";

import createFetchCache from "../runtimes/node.js";
import { createTestsForMock } from "../testUtils.js";
import FsStore from "./fs.js";

const nodeFsCacheMock = createFetchCache({ Store: FsStore });

describe("fsStore", () => {
  describe("standard tests", () => {
    before(async () => {
      await fs.rm("./tests/fixtures/http", { force: true, recursive: true });
    });
    createTestsForMock(nodeFsCacheMock);
  });
});
