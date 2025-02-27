import { test as it } from "node:test";
import { expect } from "expect";
import createCachingMock from "./runtimes/node.js";

export function createTestsForMock(mock: ReturnType<typeof createCachingMock>) {
  it("works with a Request as first argument", async (t) => {
    const url = "https://echo.free.beeceptor.com/?id=test1";
    const expectedResponse = { id: "test1" };
    t.mock.method(globalThis, "fetch", mock);
    const data = await (await fetch(new Request(url))).json();
    expect(data.parsedQueryParams).toEqual(expectedResponse);
  });

  it("works with text response (non-JSON)", async (t) => {
    const url =
      "https://echoserver.dev/server?query=%7B%22headers%22%3A%5B%5D%2C%22body%22%3A%7B%22type%22%3A%22text%22%2C%22data%22%3A%22hello%22%7D%2C%22status%22%3A200%7D";
    const expectedResponse = "hello";
    t.mock.method(globalThis, "fetch", mock);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.text();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toBe(expectedResponse);
    }
  });

  it("works with a JSON response", async (t) => {
    const url = "https://echo.free.beeceptor.com/?one=two&key=value";
    const expectedResponse = { one: "two", key: "value" };
    t.mock.method(globalThis, "fetch", mock);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }
  });

  it("differentiates requests by headers", async (t) => {
    const url = "https://echo.free.beeceptor.com/?one=two&key=value";
    const expectedResponse = { one: "two", key: "value" };
    t.mock.method(globalThis, "fetch", mock);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url, { headers: { "X-Test": "1" } });
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url, { headers: { "X-Test": "2" } });
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedQueryParams).toEqual(expectedResponse);
    }
  });

  it("differentiates requests by body", async (t) => {
    const url = "http://echo.free.beeceptor.com/sample-request";
    const jsonInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };
    t.mock.method(globalThis, "fetch", mock);

    for (let i = 0; i < 2; i++) {
      const body = { a: 1 };
      const response = await fetch(url, {
        ...jsonInit,
        body: JSON.stringify(body),
      });
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedBody).toEqual(body);
    }

    for (let i = 0; i < 2; i++) {
      const body = { b: 2 };
      const response = await fetch(url, {
        ...jsonInit,
        body: JSON.stringify(body),
      });
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedBody).toEqual(body);
    }
  });
}
