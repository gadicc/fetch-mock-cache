import { describe, test as it } from "node:test";
import { expect } from "expect";
import { deserializeBody, serializeBody } from "./body.js";

describe("body", () => {
  it("serializeBody with text", async () => {
    const body = "Hello, world!";
    const serialized = await serializeBody(
      new Response(body, {
        headers: { "Content-Type": "text/plain" },
      }),
    );
    expect(serialized).toEqual({ bodyText: body });
  });

  it("serializeBody with JSON", async () => {
    const body = { hello: "world" };
    const serialized = await serializeBody(
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(serialized).toEqual({ bodyJson: body });
  });

  it("serializeBody with binary", async () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    const serialized = await serializeBody(
      new Response(body, {
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
    expect(serialized).toEqual({ bodyBase64: "AQIDBAU=" });
  });

  it("serializeBody with no Response body", async () => {
    const serialized = await serializeBody(
      new Response(null, {
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
    expect(serialized).toEqual({ body: null });
  });

  it("serializeBody with no Request body", async () => {
    const serialized = await serializeBody(
      new Request("http://www.example.com/", {
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
    expect(serialized).toEqual({ body: null });
  });

  it("deserializeBody with text", async () => {
    const body = "Hello, world!";
    // @ts-expect-error: test stub
    const deserialized = await deserializeBody({ bodyText: body });
    const text = await new Response(deserialized).text();
    expect(text).toBe(body);
  });

  it("deserializeBody with JSON", async () => {
    const body = { hello: "world" };
    // @ts-expect-error: test stub
    const deserialized = await deserializeBody({ bodyJson: body });
    const text = await new Response(deserialized).text();
    expect(text).toBe(JSON.stringify(body));
  });

  it("deserializeBody with binary", async () => {
    const bodyBase64 = "AQIDBAU=";
    // @ts-expect-error: test stub
    const deserialized = await deserializeBody({ bodyBase64 });
    const arrayBuffer = await new Response(deserialized).arrayBuffer();
    expect(new Uint8Array(arrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3, 4, 5]),
    );
  });

  it("deserializeBody with no body", async () => {
    // @ts-expect-error: test stub
    const deserialized = await deserializeBody({ body: null });
    const text = await new Response(deserialized).text();
    expect(text).toBe("");
  });
});
