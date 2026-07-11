import { describe, test as it } from "node:test";
import { expect } from "expect";

import createFetchCache from "./runtimes/node.js";
import MemoryStore from "./stores/memory.js";
import { createFakeFetch } from "./testUtils.js";

const fetchCache = createFetchCache({
  Store: MemoryStore,
  fetch: createFakeFetch(),
});

function createCountingTextFetch() {
  const fn = async (): Promise<Response> => {
    fn.calls++;
    return new Response(`call-${fn.calls}`);
  };
  fn.calls = 0;
  return fn;
}

async function withFmcCacheMode<T>(
  mode: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = process.env.FMC_CACHE_MODE;
  if (mode === undefined) {
    delete process.env.FMC_CACHE_MODE;
  } else {
    process.env.FMC_CACHE_MODE = mode;
  }

  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.FMC_CACHE_MODE;
    } else {
      process.env.FMC_CACHE_MODE = previous;
    }
  }
}

describe("fetch-mock-cache", () => {
  describe("createFetchCache", () => {
    it("should throw if no store is provided", () => {
      expect(() => createFetchCache()).toThrow(
        /No `Store` option was provided/,
      );
    });
  });

  describe("created fetchCache", () => {
    it("should throw if no url is provided", async (t) => {
      t.mock.method(globalThis, "fetch", fetchCache);
      // @ts-expect-error: intentionally passing undefined to test runtime type checks
      await expect(fetch()).rejects.toThrow(/urlOrRequest is undefined/);
    });

    it("should pass options to store methods", async (t) => {
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: createFakeFetch(),
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      const store = fetchCache._store! as MemoryStore;
      const fetchContent = (store.fetchContent = t.mock.fn(store.fetchContent));

      // Baseline, no opts
      await fetch("https://fmc.test/");
      let optionsArg = fetchContent.mock.calls[0].arguments[1];
      expect(Object.getOwnPropertyNames(optionsArg)).toHaveLength(0);

      // fetchCache._options = [{ id: "id" }];
      fetchCache.once({ id: "id" });
      await fetch("https://fmc.test/");
      optionsArg = fetchContent.mock.calls[1].arguments[1];
      expect(optionsArg).toMatchObject({ id: "id" });

      // Now let's make sure the options are cleared
      await fetch("https://fmc.test/");
      optionsArg = fetchContent.mock.calls[2].arguments[1];
      expect(Object.getOwnPropertyNames(optionsArg)).toHaveLength(0);
    });

    it("should not mutate stored response headers with X-FMC-Cache on HIT", async (t) => {
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: createFakeFetch(),
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      // MISS
      const res1 = await fetch("https://fmc.test/");
      expect(res1.headers.get("X-FMC-Cache")).toBe("MISS");

      // HIT
      const res2 = await fetch("https://fmc.test/");
      expect(res2.headers.get("X-FMC-Cache")).toBe("HIT");

      // Verify store content remains uncontaminated
      const store = fetchCache._store! as MemoryStore;
      const cached = Array.from(store.store.values())[0];
      expect(cached.response.headers).not.toHaveProperty("X-FMC-Cache");
      expect(cached.response.headers).not.toHaveProperty("x-fmc-cache");
    });
  });

  describe("cache mode", () => {
    it("record mode skips reads and writes fresh content", async (t) => {
      const fakeFetch = createCountingTextFetch();
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
        mode: "record",
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      const res1 = await fetch("https://fmc.test/record");
      expect(res1.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(await res1.text()).toBe("call-1");

      const res2 = await fetch("https://fmc.test/record");
      expect(res2.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(await res2.text()).toBe("call-2");
      expect(fakeFetch.calls).toBe(2);

      fetchCache.options = { mode: "replay" };
      const res3 = await fetch("https://fmc.test/record");
      expect(res3.headers.get("X-FMC-Cache")).toBe("HIT");
      expect(await res3.text()).toBe("call-2");
      expect(fakeFetch.calls).toBe(2);
    });

    it("replay mode throws on a cache miss before network fetch", async (t) => {
      class LocatedMemoryStore extends MemoryStore {
        _location = "tests/fixtures/http";
      }

      const fakeFetch = createCountingTextFetch();
      const fetchCache = createFetchCache({
        Store: LocatedMemoryStore,
        fetch: fakeFetch,
        mode: "replay",
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      fetchCache.once({ id: "fixture" });
      await expect(fetch("https://fmc.test/endpoint")).rejects.toThrow(
        [
          "fetch-mock-cache: cache miss in replay mode for GET https://fmc.test/endpoint",
          "Store: LocatedMemoryStore (location: tests/fixtures/http)",
          "Computed cache id: fixture",
          'To record this fixture, set FMC_CACHE_MODE=record or createFetchCache({ mode: "record" }).',
        ].join("\n"),
      );
      expect(fakeFetch.calls).toBe(0);
    });

    it("off mode skips reads and writes", async (t) => {
      const fakeFetch = createCountingTextFetch();
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
        mode: "off",
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      const res1 = await fetch("https://fmc.test/off");
      expect(res1.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(await res1.text()).toBe("call-1");

      const res2 = await fetch("https://fmc.test/off");
      expect(res2.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(await res2.text()).toBe("call-2");
      expect(fakeFetch.calls).toBe(2);
    });

    it("reads FMC_CACHE_MODE case-insensitively at fetch time", async (t) => {
      const fakeFetch = createCountingTextFetch();
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      await withFmcCacheMode(" RePlAy ", async () => {
        await expect(fetch("https://fmc.test/env-replay")).rejects.toThrow(
          /cache miss in replay mode/,
        );
        expect(fakeFetch.calls).toBe(0);
      });
    });

    it("throws on an invalid selected FMC_CACHE_MODE", async (t) => {
      await withFmcCacheMode("invalid", async () => {
        const fakeFetch = createCountingTextFetch();
        const fetchCache = createFetchCache({
          Store: MemoryStore,
          fetch: fakeFetch,
        });
        t.mock.method(globalThis, "fetch", fetchCache);

        await expect(fetch("https://fmc.test/invalid-mode")).rejects.toThrow(
          'fetch-mock-cache: invalid cache mode "invalid" from FMC_CACHE_MODE. Valid modes: auto, replay, record, off.',
        );
        expect(fakeFetch.calls).toBe(0);
      });
    });

    it("resolves mode precedence as once, options, env, default", async (t) => {
      await withFmcCacheMode("invalid", async () => {
        const fakeFetch = createCountingTextFetch();
        const fetchCache = createFetchCache({
          Store: MemoryStore,
          fetch: fakeFetch,
          mode: "off",
        });
        t.mock.method(globalThis, "fetch", fetchCache);

        const globalRes = await fetch("https://fmc.test/precedence");
        expect(globalRes.headers.get("X-FMC-Cache")).toBe("MISS");
        expect(await globalRes.text()).toBe("call-1");

        fetchCache.options = { mode: "replay" };
        fetchCache.once({ mode: "off" });
        const onceRes = await fetch("https://fmc.test/precedence");
        expect(onceRes.headers.get("X-FMC-Cache")).toBe("MISS");
        expect(await onceRes.text()).toBe("call-2");
        expect(fakeFetch.calls).toBe(2);
      });
    });

    it("lets explicit read and write options override replay mode", async (t) => {
      const fakeFetch = createCountingTextFetch();
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
        mode: "replay",
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      fetchCache.once({ readCache: false, writeCache: true });
      const res1 = await fetch("https://fmc.test/replay-override");
      expect(res1.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(await res1.text()).toBe("call-1");

      const res2 = await fetch("https://fmc.test/replay-override");
      expect(res2.headers.get("X-FMC-Cache")).toBe("HIT");
      expect(await res2.text()).toBe("call-1");
      expect(fakeFetch.calls).toBe(1);
    });
  });

  describe("readCache option", () => {
    it("promise resolving false skips the cache", async (t) => {
      const fakeFetch = createFakeFetch();
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      // Prime the cache
      const res1 = await fetch("https://fmc.test/");
      expect(res1.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(fakeFetch.calls).toBe(1);

      // Promise resolving false skips cache
      fetchCache.once({ readCache: Promise.resolve(false) });
      const res2 = await fetch("https://fmc.test/");
      expect(res2.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(fakeFetch.calls).toBe(2);
    });

    it("promise resolving true uses the cache", async (t) => {
      const fakeFetch = createFakeFetch();
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      // Prime the cache
      const res1 = await fetch("https://fmc.test/");
      expect(res1.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(fakeFetch.calls).toBe(1);

      // Promise resolving true uses cache
      fetchCache.once({ readCache: Promise.resolve(true) });
      const res2 = await fetch("https://fmc.test/");
      expect(res2.headers.get("X-FMC-Cache")).toBe("HIT");
      expect(fakeFetch.calls).toBe(1);
    });

    it("boolean false skips the cache", async (t) => {
      const fakeFetch = createFakeFetch();
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      // Prime the cache
      const res1 = await fetch("https://fmc.test/");
      expect(res1.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(fakeFetch.calls).toBe(1);

      // Boolean false skips cache
      fetchCache.once({ readCache: false });
      const res2 = await fetch("https://fmc.test/");
      expect(res2.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(fakeFetch.calls).toBe(2);
    });
  });

  describe("redactHeaders option", () => {
    it("redacts default sensitive headers on cache miss", async (t) => {
      const fakeFetch = async () => {
        return new Response("hello", {
          headers: { "Set-Cookie": "session=xyz" },
        });
      };
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      const request = new Request("https://fmc.test/", {
        headers: {
          Authorization: "Bearer token",
          "X-Test": "123",
        },
      });

      const response = await fetch(request);
      expect(response.headers.get("X-FMC-Cache")).toBe("MISS");

      const store = fetchCache._store! as MemoryStore;
      const cached = Array.from(store.store.values())[0];

      expect(cached.request.headers).toEqual({
        authorization: "[REDACTED]",
        "x-test": "123",
      });
      expect(cached.response.headers).toMatchObject({
        "set-cookie": ["[REDACTED]"],
      });
    });

    it("has key stability across different secret values", async (t) => {
      let fetchCount = 0;
      const fakeFetch = async () => {
        fetchCount++;
        return new Response("hello");
      };
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      // First fetch with authorization token A
      const res1 = await fetch("https://fmc.test/", {
        headers: { Authorization: "Bearer AAA" },
      });
      expect(res1.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(fetchCount).toBe(1);

      // Second fetch with authorization token B
      const res2 = await fetch("https://fmc.test/", {
        headers: { Authorization: "Bearer BBB" },
      });
      expect(res2.headers.get("X-FMC-Cache")).toBe("HIT");
      expect(fetchCount).toBe(1);
    });

    it("disables redaction when redactHeaders is false", async (t) => {
      const fakeFetch = async () => new Response("hello");
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
        redactHeaders: false,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      await fetch("https://fmc.test/", {
        headers: { Authorization: "Bearer token" },
      });

      const store = fetchCache._store! as MemoryStore;
      const cached = Array.from(store.store.values())[0];
      expect(cached.request.headers).toEqual({
        authorization: "Bearer token",
      });
    });

    it("configures request and response redaction independently", async (t) => {
      const fakeFetch = async () =>
        new Response("hello", {
          headers: {
            Authorization: "Bearer response-token",
            "Set-Cookie": "session=xyz",
          },
        });
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
        redactHeaders: false,
        redactRequestHeaders: ["cookie"],
        redactResponseHeaders: ["authorization"],
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      await fetch("https://fmc.test/", {
        headers: {
          Authorization: "Bearer request-token",
          Cookie: "session=abc",
        },
      });

      const store = fetchCache._store! as MemoryStore;
      const cached = Array.from(store.store.values())[0];
      expect(cached.request.headers).toEqual({
        authorization: "Bearer request-token",
        cookie: "[REDACTED]",
      });
      expect(cached.response.headers).toMatchObject({
        authorization: "[REDACTED]",
        "set-cookie": ["session=xyz"],
      });
    });
  });

  describe("redactSearchParams option", () => {
    it("redacts query params from stored URL and store key", async (t) => {
      const fakeFetch = async () => new Response("hello");
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      await fetch("https://api.example.com/eod?apikey=sk-live-123&symbol=AAPL");

      const store = fetchCache._store! as MemoryStore;
      const cached = Array.from(store.store.values())[0];
      expect(cached.request.url).toBe(
        "https://api.example.com/eod?apikey=REDACTED&symbol=AAPL",
      );

      const storeKey = Array.from(store.store.keys())[0];
      expect(storeKey).toContain("apikey=REDACTED");
      expect(storeKey).not.toContain("sk-live-123");
    });

    it("has key stability across different secret values", async (t) => {
      let fetchCount = 0;
      const fakeFetch = async () => {
        fetchCount++;
        return new Response("hello");
      };
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      // First fetch with key AAA
      const res1 = await fetch(
        "https://api.example.com/eod?apikey=AAA&symbol=AAPL",
      );
      expect(res1.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(fetchCount).toBe(1);

      // Second fetch with key BBB
      const res2 = await fetch(
        "https://api.example.com/eod?apikey=BBB&symbol=AAPL",
      );
      expect(res2.headers.get("X-FMC-Cache")).toBe("HIT");
      expect(fetchCount).toBe(1);
    });

    it("presence still distinguishes requests", async (t) => {
      let fetchCount = 0;
      const fakeFetch = async () => {
        fetchCount++;
        return new Response("hello");
      };
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      // First fetch with apikey
      await fetch("https://api.example.com/eod?apikey=AAA&symbol=AAPL");
      expect(fetchCount).toBe(1);

      // Second fetch without apikey
      const res2 = await fetch("https://api.example.com/eod?symbol=AAPL");
      expect(res2.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(fetchCount).toBe(2);
    });

    it("disables param redaction when redactSearchParams is false", async (t) => {
      const fakeFetch = async () => new Response("hello");
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
        redactSearchParams: false,
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      await fetch("https://api.example.com/eod?apikey=sk-live-123&symbol=AAPL");

      const store = fetchCache._store! as MemoryStore;
      const cached = Array.from(store.store.values())[0];
      expect(cached.request.url).toBe(
        "https://api.example.com/eod?apikey=sk-live-123&symbol=AAPL",
      );
    });

    it("supports custom list of param names to redact", async (t) => {
      const fakeFetch = async () => new Response("hello");
      const fetchCache = createFetchCache({
        Store: MemoryStore,
        fetch: fakeFetch,
        redactSearchParams: ["custom"],
      });
      t.mock.method(globalThis, "fetch", fetchCache);

      await fetch("https://api.example.com/eod?apikey=sk-live-123&custom=abc");

      const store = fetchCache._store! as MemoryStore;
      const cached = Array.from(store.store.values())[0];
      expect(cached.request.url).toBe(
        "https://api.example.com/eod?apikey=sk-live-123&custom=REDACTED",
      );
    });
  });
});
