import fetchMock from "jest-fetch-mock";
fetchMock.enableMocks();

import fs from "fs/promises";
import { describe, expect, test as it } from "@jest/globals";

import { createCachingMock } from "../index";
import nodeFsStore from "./nodeFs";
import { createTestsForMock } from "../testUtils";

const nodeFsCacheMock = createCachingMock({ store: new nodeFsStore() });

describe("memoryStore", () => {
  describe("standard tests", () => {
    beforeAll(async () => {
      await fs.rm("./tests/fixtures/http", { force: true, recursive: true });
    });
    createTestsForMock(nodeFsCacheMock);
  });
});
