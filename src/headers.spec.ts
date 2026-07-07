import { describe, test as it } from "node:test";
import { expect } from "expect";
import { deserializeHeaders, serializeHeaders, redactHeaders } from "./headers.js";

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

    const headers = deserializeHeaders(serialized);

    expect(headers.get("x-test")).toBe("1");
    expect(headers.getSetCookie()).toEqual(["a", "b"]);
  });

  describe("redactHeaders", () => {
    it("redacts default sensitive headers case-insensitively", () => {
      const serialized = {
        "x-test": "1",
        authorization: "Bearer secret_token",
        COOKIE: "session=123",
      };
      const redacted = redactHeaders(serialized);
      expect(redacted).toEqual({
        "x-test": "1",
        authorization: "[REDACTED]",
        COOKIE: "[REDACTED]",
      });
      // Ensure input not mutated
      expect(serialized.authorization).toBe("Bearer secret_token");
    });

    it("supports custom list of headers to redact", () => {
      const serialized = {
        "x-custom": "secret",
        authorization: "Bearer secret_token",
      };
      const redacted = redactHeaders(serialized, ["x-custom"]);
      expect(redacted).toEqual({
        "x-custom": "[REDACTED]",
        authorization: "Bearer secret_token",
      });
    });

    it("redacts array values (like set-cookie) per-entry", () => {
      const serialized = {
        "set-cookie": ["cookie1=abc", "cookie2=def"],
      };
      const redacted = redactHeaders(serialized);
      expect(redacted).toEqual({
        "set-cookie": ["[REDACTED]", "[REDACTED]"],
      });
    });
  });
});

