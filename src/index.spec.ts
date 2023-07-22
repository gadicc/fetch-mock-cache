import fetchMock from "jest-fetch-mock";
fetchMock.enableMocks();

import { describe, expect, test as it } from "@jest/globals";
import createCachingMock from "./index";
// import JFMCNodeFSStore from "./stores/nodeFs";
import JSMCMemoryStore from "./stores/memory";

const memoryCacheMock = createCachingMock({ store: new JSMCMemoryStore() });

describe("cachingMock", () => {
  it("should work", async () => {
    fetchMock.mockImplementationOnce(memoryCacheMock);

    const response1 = await fetch("http://echo.jsontest.com/key/value/one/two");
    const data1 = await response1.json();

    expect(response1.headers.get("X-JFMC-Cache")).toBe("MISS");
    expect(data1).toEqual({
      one: "two",
      key: "value",
    });

    fetchMock.mockImplementationOnce(memoryCacheMock);

    const response2 = await fetch("http://echo.jsontest.com/key/value/one/two");
    const data2 = await response2.json();

    expect(response2.headers.get("X-JFMC-Cache")).toBe("HIT");
    expect(data2).toEqual({
      one: "two",
      key: "value",
    });
  });
});
