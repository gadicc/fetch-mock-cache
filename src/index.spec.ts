import fetchMock from "jest-fetch-mock";
fetchMock.enableMocks();

import { describe, expect, test as it } from "@jest/globals";
import createCachingMock from "./index";

describe("cachingMock", () => {
  it("should work", async () => {
    fetchMock.mockImplementationOnce(createCachingMock());

    const response = await fetch("http://echo.jsontest.com/key/value/one/two");
    const data = await response.json();

    expect(data).toEqual({
      one: "two",
      key: "value",
    });
  });
});
