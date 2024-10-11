import { describe } from "node:test";

import createFetchCache from "../runtimes/node.js";
import MemoryStore from "./memory.js";
import { createTestsForMock } from "../testUtils.js";

const memoryCacheMock = createFetchCache({ Store: MemoryStore });

describe("memoryStore", () => {
  describe("standard tests", () => createTestsForMock(memoryCacheMock));
});
