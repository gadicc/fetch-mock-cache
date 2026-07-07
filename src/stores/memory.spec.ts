import { describe } from "node:test";

import createFetchCache from "../runtimes/node.js";
import { createFakeFetch, createTestsForMock } from "../testUtils.js";
import MemoryStore from "./memory.js";

const memoryCacheMock = createFetchCache({
  Store: MemoryStore,
  fetch: createFakeFetch(),
});

describe("memoryStore", () => {
  describe("standard tests", () => createTestsForMock(memoryCacheMock));
});
