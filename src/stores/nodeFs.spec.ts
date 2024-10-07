import { describe, test as it, before } from "node:test";
import fs from "fs/promises";

import { createCachingMock } from "../index";
import nodeFsStore from "./nodeFs";
import { createTestsForMock } from "../testUtils";

const nodeFsCacheMock = createCachingMock({ store: new nodeFsStore() });

describe("nodeFsStore", () => {
  describe("standard tests", () => {
    before(async () => {
      await fs.rm("./tests/fixtures/http", { force: true, recursive: true });
    });
    createTestsForMock(nodeFsCacheMock);
  });
});
