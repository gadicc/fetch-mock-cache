import { describe } from "node:test";

import createCachingMock from "../runtimes/node.js";
import JSMCMemoryStore from "./memory.js";
import { createTestsForMock } from "../testUtils.js";

const memoryCacheMock = createCachingMock({ store: new JSMCMemoryStore() });

describe("memoryStore", () => {
  describe("standard tests", () => createTestsForMock(memoryCacheMock));
});
