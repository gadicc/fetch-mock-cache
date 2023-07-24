import fetchMock from "jest-fetch-mock";
fetchMock.enableMocks();

import { describe, expect, test as it } from "@jest/globals";

import createCachingMock from "../index";
import JSMCMemoryStore from "./memory";
import { createTestsForMock } from "../testUtils";

const memoryCacheMock = createCachingMock({ store: new JSMCMemoryStore() });

describe("memoryStore", () => {
  describe("standard tests", () => createTestsForMock(memoryCacheMock));
});
