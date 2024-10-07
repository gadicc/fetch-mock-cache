import { describe, test as it } from "node:test";

import { createCachingMock } from "../index";
import JSMCMemoryStore from "./memory";
import { createTestsForMock } from "../testUtils";

const memoryCacheMock = createCachingMock({ store: new JSMCMemoryStore() });

describe("memoryStore", () => {
  describe("standard tests", () => createTestsForMock(memoryCacheMock));
});
