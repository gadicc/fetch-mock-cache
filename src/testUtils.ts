import { createCachingMock } from "./index";

export function createTestsForMock(mock: ReturnType<typeof createCachingMock>) {
  it("works with a Request as first argument", async () => {
    const url = "http://echo.jsontest.com/id/test1";
    const expectedResponse = { id: "test1" };
    fetchMock.mockImplementationOnce(mock);
    const data = await (await fetch(new Request(url))).json();
    expect(data).toEqual(expectedResponse);
  });

  it("works with text response (non-JSON)", async () => {
    const url =
      "https://echoserver.dev/server?query=%7B%22headers%22%3A%5B%5D%2C%22body%22%3A%7B%22type%22%3A%22text%22%2C%22data%22%3A%22hello%22%7D%2C%22status%22%3A200%7D";
    const expectedResponse = "hello";

    for (let i = 0; i < 2; i++) {
      fetchMock.mockImplementationOnce(mock);
      const response = await fetch(url);
      const data = await response.text();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-JFMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toBe(expectedResponse);
    }
  });

  it("works with a JSON response", async () => {
    const url = "http://echo.jsontest.com/key/value/one/two";
    const expectedResponse = { one: "two", key: "value" };

    for (let i = 0; i < 2; i++) {
      fetchMock.mockImplementationOnce(mock);
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-JFMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }
  });

  it("differentiates requests by headers", async () => {
    const url = "http://echo.jsontest.com/key/value/one/two";
    const expectedResponse = { one: "two", key: "value" };

    for (let i = 0; i < 2; i++) {
      fetchMock.mockImplementationOnce(mock);
      const response = await fetch(url, { headers: { "X-Test": "1" } });
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-JFMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }

    for (let i = 0; i < 2; i++) {
      fetchMock.mockImplementationOnce(mock);
      const response = await fetch(url, { headers: { "X-Test": "2" } });
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-JFMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }
  });

  it("differentiates requests by body", async () => {
    const url = "http://echo.free.beeceptor.com/sample-request";
    const jsonInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };

    for (let i = 0; i < 2; i++) {
      fetchMock.mockImplementationOnce(mock);
      const body = { a: 1 };
      const response = await fetch(url, {
        ...jsonInit,
        body: JSON.stringify(body),
      });
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-JFMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedBody).toEqual(body);
    }

    for (let i = 0; i < 2; i++) {
      fetchMock.mockImplementationOnce(mock);
      const body = { b: 2 };
      const response = await fetch(url, {
        ...jsonInit,
        body: JSON.stringify(body),
      });
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-JFMC-Cache")).toBe(expectedCacheHeader);
      expect(data.parsedBody).toEqual(body);
    }
  });
}
