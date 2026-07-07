import { test as it } from "node:test";
import { expect } from "expect";
import createCachingMock from "./runtimes/node.js";

export function createFakeFetch() {
  const fn = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    fn.calls++;
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    // /text endpoint returns plain text; everything else echoes JSON
    if (url.pathname === "/text")
      return new Response("hello", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    const body = request.body ? await request.text() : null;
    return new Response(
      JSON.stringify({
        parsedQueryParams: Object.fromEntries(url.searchParams.entries()),
        parsedBody: body ? JSON.parse(body) : undefined,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  fn.calls = 0;
  return fn;
}

export function createTestsForMock(mock: ReturnType<typeof createCachingMock>) {
  it("works with a Request as first argument", async (t) => {
    const url = "https://fmc.test/?id=test1";
    const expectedResponse = { id: "test1" };
    t.mock.method(globalThis, "fetch", mock);
    const data = await (await fetch(new Request(url))).json();
    expect(data.parsedQueryParams).toEqual(expectedResponse);
  });

  it("works with text response (non-JSON)", async (t) => {
    const url = "https://fmc.test/text";
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
    const url = "https://fmc.test/?one=two&key=value";
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
    const url = "https://fmc.test/?one=two&key=value";
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
    const url = "https://fmc.test/sample-request";
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

  it("sends method/headers/body on miss when called with a Request object", async (t) => {
    const url = "https://fmc.test/request-object-post";
    t.mock.method(globalThis, "fetch", mock);
    const body = { hello: "req" };
    const request = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = await fetch(request);
    const data = await response.json();
    expect(data.parsedBody).toEqual(body);
  });
}
