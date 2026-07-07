import { describe, test as it } from "node:test";
import { expect } from "expect";
import {
  DEFAULT_REDACTED_SEARCH_PARAMS,
  REDACTED_PARAM_VALUE,
  redactSearchParams,
} from "./url.js";

describe("redactSearchParams", () => {
  it("redacts default sensitive params preserving order and other params", () => {
    const original = "https://api.example.com/eod?apikey=sk123&symbol=AAPL";
    const expected = "https://api.example.com/eod?apikey=REDACTED&symbol=AAPL";
    expect(redactSearchParams(original)).toBe(expected);
  });

  it("matches param names case-insensitively", () => {
    const original = "https://api.example.com/eod?apiKey=x&APIKEY=y";
    const expected =
      "https://api.example.com/eod?apiKey=REDACTED&APIKEY=REDACTED";
    expect(redactSearchParams(original)).toBe(expected);
  });

  it("redacts every occurrence of a repeated param", () => {
    const original = "https://api.example.com/eod?token=a&b=2&token=c";
    const expected =
      "https://api.example.com/eod?token=REDACTED&b=2&token=REDACTED";
    expect(redactSearchParams(original)).toBe(expected);
  });

  it("returns the exact same string instance if there is no match or no query string", () => {
    const noMatch = "https://api.example.com/eod?symbol=AAPL&page=2";
    expect(redactSearchParams(noMatch)).toBe(noMatch);

    const noQuery = "https://api.example.com/eod";
    expect(redactSearchParams(noQuery)).toBe(noQuery);
  });

  it("supports a custom list of param names to redact", () => {
    const original = "https://api.example.com/eod?apikey=123&custom=abc";
    const customList = ["custom"];
    const expected = "https://api.example.com/eod?apikey=123&custom=REDACTED";
    expect(redactSearchParams(original, customList)).toBe(expected);
  });

  it("guards that REDACTED_PARAM_VALUE is safe for filenames and store bracket-splits", () => {
    expect(REDACTED_PARAM_VALUE).not.toContain("[");
    expect(REDACTED_PARAM_VALUE).not.toContain("]");
    expect(REDACTED_PARAM_VALUE).not.toContain("?");
    expect(REDACTED_PARAM_VALUE).not.toContain("&");
    expect(REDACTED_PARAM_VALUE).not.toContain("#");
  });

  it("guards that 'key' is not in DEFAULT_REDACTED_SEARCH_PARAMS", () => {
    expect(DEFAULT_REDACTED_SEARCH_PARAMS).not.toContain("key");
    expect(DEFAULT_REDACTED_SEARCH_PARAMS).not.toContain("KEY");
  });
});
