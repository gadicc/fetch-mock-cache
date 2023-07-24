import { describe, expect, test as it } from "@jest/globals";
import { serializeHeaders, unserializeHeaders } from "./headers";

// Will polyfil fetch with node-fetch, which has headers.raw()
import "jest-fetch-mock";

describe("headers", () => {
  it("serializeHeaders", () => {
    const headers = new Headers();
    headers.append("X-Test", "1");
    headers.append("set-cookie", "a");
    headers.append("set-cookie", "b");

    const serialized = serializeHeaders(headers);
    expect(serialized).toMatchObject({
      "x-test": "1",
      "set-cookie": ["a", "b"],
    });
  });

  it("unserializeHeaders", () => {
    const serialized = {
      "x-test": "1",
      "set-cookie": ["a", "b"],
    };

    const headers = unserializeHeaders(serialized);

    expect(headers.get("x-test")).toBe("1");
    // @ts-expect-error: node-fetch
    expect(headers.raw()["set-cookie"]).toEqual(["a", "b"]);
  });
});
