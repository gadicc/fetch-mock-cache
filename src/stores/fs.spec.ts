import { win32 } from "node:path";
import { describe, test as it, type TestContext } from "node:test";
import { expect } from "expect";
import fs from "fs/promises";

import type { FMCCacheContent } from "../cache.js";
import createFetchCache, { runtime } from "../runtimes/node.js";
import { createFakeFetch, createTestsForMock } from "../testUtils.js";
import FsStore from "./fs.js";

const location = `coverage/fmc-test-temp-${Math.random().toString(36).slice(2)}`;
const nodeFsCacheMock = createFetchCache({
  Store: [FsStore, { location }],
  fetch: createFakeFetch(),
});

describe("filesystem fixture identity", () => {
  const long =
    "https://fmc.test/" + "organizations/workspaces/members/".repeat(5);
  const pairs = [
    ["encoded slash", "https://fmc.test/a%2Fb", "https://fmc.test/a/b"],
    ["colon", "https://fmc.test/a:b", "https://fmc.test/a/b"],
    ["bang", "https://fmc.test/a!b", "https://fmc.test/a/b"],
    ["scheme", "http://fmc.test/a", "https://fmc.test/a"],
    ["truncation", `${long}user-1.json`, `${long}user-2.json`],
    ["case", "https://fmc.test/Item", "https://fmc.test/item"],
  ];

  for (const [name, first, second] of pairs) {
    it(`records and replays distinct responses for ${name}`, async (t) => {
      const { cache, store, location } = await isolatedStore(t);
      expect(await store.idFromRequest({ url: first })).not.toBe(
        await store.idFromRequest({ url: second }),
      );
      for (const url of [first, second]) {
        const response = await cache(url, undefined);
        expect(response.headers.get("X-FMC-Cache")).toBe("MISS");
        expect(await response.text()).toBe(url);
      }
      const replay = createFetchCache({
        Store: [FsStore, { location }],
        mode: "replay",
        fetch: noNetwork,
      });
      for (const url of [first, second]) {
        const response = await replay(url, undefined);
        expect(response.headers.get("X-FMC-Cache")).toBe("HIT");
        expect(await response.text()).toBe(url);
      }
      expect((await fs.readdir(`${location}/fmc-v1`)).length).toBe(2);
    });
  }

  it("includes method, full header hashes, and body in automatic identity", async (t) => {
    const { store } = await isolatedStore(t);
    const base = { url: "https://fmc.test/identity" };
    const requests = [
      base,
      { ...base, method: "POST" },
      { ...base, headers: { "x-test": "one" } },
      { ...base, headers: { "x-test": "two" } },
      { ...base, method: "POST", bodyText: "one" },
      { ...base, method: "POST", bodyText: "two" },
    ];
    const ids = await Promise.all(requests.map((r) => store.idFromRequest(r)));
    expect(new Set(ids).size).toBe(requests.length);
    expect(ids[0]).toMatch(/^fmc.test!identity-[a-f0-9]{64}\.json$/);
    expect(ids[0]).toBe(
      "fmc.test!identity-859996e519e0a3db21ef24c270f92fa52b3ce369453e396c03cbf7dd734efff0.json",
    );
    expect(await store.idFromRequest({ ...base, method: "GET" })).toBe(ids[0]);
    expect(await store.idFromRequest(base)).toBe(ids[0]);
    const lengths: (number | undefined)[] = [];
    store.runtime = {
      ...runtime,
      sha256: async (input, length) => {
        lengths.push(length);
        return runtime.sha256(input, length);
      },
    };
    await store.idFromRequest(requests[4]);
    await store.idFromRequest(requests[2]);
    expect(lengths).toEqual([64, 64, 64, 64]);
  });

  it("frames literal method-like URL suffixes separately from identifiers", async (t) => {
    const { store } = await isolatedStore(t);
    const url = "https://fmc.test/" + "long/".repeat(20);
    const first = { url: `${url}[method=POST]` };
    const second = { url, method: "POST" };
    expect(await store.idFromRequest(first)).not.toBe(
      await store.idFromRequest(second),
    );
    await store.storeContent(fixture(first, "literal brackets"));
    await store.storeContent(fixture(second, "POST"));
    expect(await store.fetchContent(first)).toEqual(
      fixture(first, "literal brackets"),
    );
    expect(await store.fetchContent(second)).toEqual(fixture(second, "POST"));
  });

  it("keeps distinct binary bodies distinct despite lossy UTF-8 decoding", async (t) => {
    const { store } = await isolatedStore(t);
    const first = {
      url: "https://fmc.test/upload",
      method: "POST",
      bodyBase64: btoa(String.fromCharCode(0x80)),
    };
    const second = { ...first, bodyBase64: btoa(String.fromCharCode(0x81)) };
    expect(await store.idFromRequest(first)).not.toBe(
      await store.idFromRequest(second),
    );
    await store.storeContent(fixture(first, "first"));
    await store.storeContent(fixture(second, "second"));
    expect(await store.fetchContent(first)).toEqual(fixture(first, "first"));
    expect(await store.fetchContent(second)).toEqual(fixture(second, "second"));
  });

  for (const url of [
    "http://[::1]:8080/a",
    "https://con.test/windows",
    "https://fmc.test/?q=[../../../outside]",
    "https://fmc.test/?q=[..\\..\\outside]",
    `https://fmc.test/${"界😀".repeat(100)}.json`,
    `https://fmc.test/a.${"x".repeat(400)}`,
    "https://fmc.test/%invalid",
  ]) {
    it(`handles safe new paths for ${url.slice(0, 65)}`, async (t) => {
      const { cache, store, location } = await isolatedStore(t);
      const readPaths: string[] = [];
      store.runtime = {
        ...runtime,
        fs: {
          ...runtime.fs,
          readFile: async (path) => {
            readPaths.push(path);
            return runtime.fs.readFile(path);
          },
        },
      };
      const request = new Request(url, {
        method: "POST",
        headers: { "x-test": "one" },
      });
      const response = await cache(request, undefined);
      expect(response.headers.get("X-FMC-Cache")).toBe("MISS");
      expect(await response.text()).toBe(request.url);
      const files = await fs.readdir(`${location}/fmc-v1`);
      expect(files).toHaveLength(1);
      expect(new TextEncoder().encode(files[0]).length).toBeLessThanOrEqual(
        130,
      );
      expect(files[0]).toMatch(/^[a-zA-Z0-9!._-]+-[a-f0-9]{64}\.json$/);
      if (url.startsWith("https://con.test"))
        expect(files[0]).toMatch(/^!con\.test/);
      expect(
        readPaths.every((path) => {
          const name = path.slice(store._location.length + 1);
          return (
            path.startsWith(`${store._location}/`) &&
            !name.split(/[\/\\]/).includes("..")
          );
        }),
      ).toBe(true);
      // Also exercise non-normalized multibyte URLs passed directly to a store.
      const directId = await store.idFromRequest({ url });
      expect(new TextEncoder().encode(directId).length).toBeLessThanOrEqual(
        130,
      );
      cache.options = { mode: "replay" };
      expect((await cache(request, undefined)).headers.get("X-FMC-Cache")).toBe(
        "HIT",
      );
    });
  }

  it("hashes the redacted identity rather than changing credentials", async (t) => {
    const { cache, location } = await isolatedStore(t);
    await cache("https://fmc.test/redacted?token=first-dummy", {
      headers: { authorization: "Bearer first-dummy" },
    });
    const response = await cache(
      "https://fmc.test/redacted?token=second-dummy",
      {
        headers: { authorization: "Bearer second-dummy" },
      },
    );
    expect(response.headers.get("X-FMC-Cache")).toBe("HIT");
    const files = await fs.readdir(`${location}/fmc-v1`);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain("dummy");
    const saved = JSON.parse(
      await fs.readFile(`${location}/fmc-v1/${files[0]}`, "utf8"),
    );
    expect(saved.request.url).toBe("https://fmc.test/redacted?token=REDACTED");
    expect(saved.request.headers.authorization).toBe("[REDACTED]");
  });

  it("preserves explicit IDs and their intentional request aliases", async (t) => {
    const { cache, store, location } = await isolatedStore(t);
    cache.options = { id: "chosen" };
    expect(
      await store.idFromRequest(
        { url: "https://fmc.test/a" },
        { id: "chosen" },
      ),
    ).toBe("chosen.json");
    await cache("https://fmc.test/a", undefined);
    const response = await cache("https://fmc.test/b", undefined);
    expect(response.headers.get("X-FMC-Cache")).toBe("HIT");
    expect(await response.text()).toBe("https://fmc.test/a");
    cache.once({ id: "next" });
    await cache("https://fmc.test/c", undefined);
    expect((await fs.readdir(location)).sort()).toEqual([
      "chosen.json",
      "next.json",
    ]);
  });

  it("can replay every committed legacy fixture", async () => {
    const store = new FsStore({ runtime });
    const files = (await fs.readdir("tests/fixtures/http")).filter((f) =>
      f.endsWith(".json"),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = JSON.parse(
        await fs.readFile(`tests/fixtures/http/${file}`, "utf8"),
      ) as FMCCacheContent;
      expect(await store.fetchContent(content.request)).toEqual(content);
    }
  });

  for (const method of [undefined, "GET"]) {
    it(`replays a verified legacy fixture with method ${method} without writes`, async (t) => {
      const { cache, store, location } = await isolatedStore(t);
      const request = { url: "https://fmc.test/a:b", method };
      const text = await writeLegacy(
        store,
        "fmc.test!a!b.json",
        fixture(request, "legacy"),
      );
      store.runtime = {
        ...runtime,
        fs: {
          ...runtime.fs,
          mkdir: async () => {
            throw new Error("mkdir during replay");
          },
          writeFile: async () => {
            throw new Error("write during replay");
          },
        },
      };
      cache.options = { mode: "replay" };
      const response = await cache(request.url, undefined);
      expect(response.headers.get("X-FMC-Cache")).toBe("HIT");
      expect(await response.text()).toBe("legacy");
      expect(await fs.readdir(location)).toEqual(["fmc.test!a!b.json"]);
      expect(await fs.readFile(`${location}/fmc.test!a!b.json`, "utf8")).toBe(
        text,
      );
    });
  }

  it("rejects a colliding legacy URL in replay and records it separately in auto", async (t) => {
    const { cache, store, location } = await isolatedStore(t);
    const original = { url: "https://fmc.test/a:b" };
    const other = "https://fmc.test/a/b";
    const text = await writeLegacy(
      store,
      "fmc.test!a!b.json",
      fixture(original, "legacy"),
    );
    const network = t.mock.fn(noNetwork);
    const replay = createFetchCache({
      Store: [FsStore, { location }],
      mode: "replay",
      fetch: network,
    });
    await expect(replay(other, undefined)).rejects.toThrow(
      /cache miss in replay mode/,
    );
    expect(network.mock.callCount()).toBe(0);
    expect(await fs.readdir(location)).toEqual(["fmc.test!a!b.json"]);
    const response = await cache(other, undefined);
    expect(response.headers.get("X-FMC-Cache")).toBe("MISS");
    expect(await response.text()).toBe(other);
    expect(await fs.readFile(`${location}/fmc.test!a!b.json`, "utf8")).toBe(
      text,
    );
    expect(await (await replay(original.url, undefined)).text()).toBe("legacy");
    expect(await (await replay(other, undefined)).text()).toBe(other);
  });

  it("keeps legacy names that mimic digest names separate from new fixtures", async (t) => {
    const { cache, store, location } = await isolatedStore(t);
    const url = "https://fmc.test/a";
    const name = await store.idFromRequest({ url });
    const mimickingUrl = `https://fmc.test/a-${name.slice("fmc.test!a-".length, -5)}`;
    const original = fixture({ url: mimickingUrl }, "legacy mimic");
    const text = await writeLegacy(store, name, original);
    const response = await cache(url, undefined);
    expect(response.headers.get("X-FMC-Cache")).toBe("MISS");
    expect(await response.text()).toBe(url);
    expect(await fs.readFile(`${location}/${name}`, "utf8")).toBe(text);
    expect(await store.fetchContent(original.request)).toEqual(original);
    expect(await (await cache(url, undefined)).text()).toBe(url);
  });

  it("rejects mismatched request metadata in a current fixture", async (t) => {
    const { store } = await isolatedStore(t);
    const request = { url: "https://fmc.test/a" };
    await fs.writeFile(
      await store.pathFromRequest(request),
      JSON.stringify(fixture({ url: "https://fmc.test/b" }, "wrong")),
    );
    expect(await store.fetchContent(request)).toBeNull();
  });

  it("replays a legacy POST with headers, JSON body, and POSIX query punctuation", async (t) => {
    const { cache, store } = await isolatedStore(t);
    const request = {
      url: "https://fmc.test/items?filter[since]=2024-01-01T00:00:00Z",
      method: "POST",
      headers: { "content-type": "application/json" },
      bodyJson: { a: 1 },
    };
    await writeLegacy(
      store,
      "fmc.test!items!filter=[since]=2024-01-01T00:00:00Z[method=POST,headers=940a617,body=015abd7].json",
      fixture(request, "POST legacy"),
    );
    cache.options = { mode: "replay" };
    const response = await cache(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.bodyJson),
    });
    expect(response.headers.get("X-FMC-Cache")).toBe("HIT");
    expect(await response.text()).toBe("POST legacy");
  });

  it("replays a redacted legacy URL with a different credential", async (t) => {
    const { cache, store } = await isolatedStore(t);
    await writeLegacy(
      store,
      "fmc.test!redacted!token=REDACTED.json",
      fixture(
        { url: "https://fmc.test/redacted?token=REDACTED" },
        "redacted legacy",
      ),
    );
    cache.options = { mode: "replay" };
    const response = await cache(
      "https://fmc.test/redacted?token=dummy",
      undefined,
    );
    expect(response.headers.get("X-FMC-Cache")).toBe("HIT");
    expect(await response.text()).toBe("redacted legacy");
  });

  it("rejects method-like URL ambiguity in legacy filenames", async (t) => {
    const { store } = await isolatedStore(t);
    const original = { url: "https://fmc.test/a[method=POST]" };
    await writeLegacy(
      store,
      "fmc.test!a[method=POST].json",
      fixture(original, "GET with brackets"),
    );
    expect(
      await store.fetchContent({ url: "https://fmc.test/a", method: "POST" }),
    ).toBeNull();
  });

  it("verifies legacy request identifiers, not just its URL", async (t) => {
    const { store } = await isolatedStore(t);
    await writeLegacy(
      store,
      "fmc.test!a.json",
      fixture({ url: "https://fmc.test/a", method: "POST" }, "wrong method"),
    );
    expect(await store.fetchContent({ url: "https://fmc.test/a" })).toBeNull();
  });

  it("rejects a binary-body collision in a legacy fixture", async (t) => {
    const { store } = await isolatedStore(t);
    const first = {
      url: "https://fmc.test/upload",
      method: "POST",
      bodyBase64: "gA==",
    };
    const second = { ...first, bodyBase64: "gQ==" };
    await writeLegacy(
      store,
      "fmc.test!upload[method=POST,body=83d544c].json",
      fixture(first, "first"),
    );
    expect(await store.fetchContent(first)).toEqual(fixture(first, "first"));
    expect(await store.fetchContent(second)).toBeNull();
  });

  it("prefers refreshed current content over stale legacy content", async (t) => {
    const { cache, store, location } = await isolatedStore(t);
    const request = { url: "https://fmc.test/a" };
    await writeLegacy(store, "fmc.test!a.json", fixture(request, "stale"));
    cache.options = { mode: "record" };
    expect(await (await cache(request.url, undefined)).text()).toBe(
      request.url,
    );
    cache.options = { mode: "replay" };
    expect(await (await cache(request.url, undefined)).text()).toBe(
      request.url,
    );
    expect(await fs.readdir(location)).toHaveLength(2);
  });

  for (const request of [
    null,
    {},
    { url: 42 },
    { url: "https://fmc.test/a", body: "invalid" },
  ]) {
    it(`rejects unreconstructable legacy metadata ${JSON.stringify(request)}`, async (t) => {
      const { store } = await isolatedStore(t);
      await fs.writeFile(
        await store.cache_dir("fmc.test!a.json"),
        JSON.stringify({
          request,
          response: fixture({ url: "" }, "bad").response,
        }),
      );
      expect(
        await store.fetchContent({ url: "https://fmc.test/a" }),
      ).toBeNull();
    });
  }

  it("does not create directories on a missing replay lookup", async (t) => {
    const { store } = await isolatedStore(t);
    await fs.rm(store._location, { recursive: true });
    expect(
      await store.fetchContent({ url: "https://fmc.test/missing" }),
    ).toBeNull();
    await expect(fs.stat(store._location)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("honors subclass naming and path overrides without legacy fallback", async (t) => {
    const { store, location } = await isolatedStore(t);
    const request = { url: "https://fmc.test/a" };
    await writeLegacy(store, "fmc.test!a.json", fixture(request, "unrelated"));
    class CustomIdStore extends FsStore {
      override async idFromRequest() {
        return "custom.json";
      }
    }
    const custom = new CustomIdStore({ runtime, location });
    expect(await custom.fetchContent(request)).toBeNull();
    await custom.storeContent(fixture(request, "custom"));
    expect(await custom.fetchContent(request)).toEqual(
      fixture(request, "custom"),
    );
    class CustomPathStore extends FsStore {
      override async idFromRequest(): Promise<string> {
        throw new Error("custom path must not derive an automatic id");
      }
      override async pathFromRequest() {
        return `${this._location}/path.json`;
      }
    }
    const pathStore = new CustomPathStore({ runtime, location });
    expect(await pathStore.fetchContent(request)).toBeNull();
    await pathStore.storeContent(fixture(request, "path"));
    expect(await pathStore.fetchContent(request)).toEqual(
      fixture(request, "path"),
    );
  });

  it("honors cache_dir overrides for both reads and writes", async (t) => {
    const { location } = await isolatedStore(t);
    class CustomDirectoryStore extends FsStore {
      override async cache_dir(filename: string) {
        const directory = `${this._location}/suite`;
        await fs.mkdir(directory, { recursive: true });
        return `${directory}/${filename}`;
      }
    }
    const store = new CustomDirectoryStore({ runtime, location });
    const content = fixture({ url: "https://fmc.test/a" }, "suite fixture");
    await store.storeContent(content);
    expect(await store.fetchContent(content.request)).toEqual(content);
  });

  it("honors overridden body identifiers for both text and binary requests", async (t) => {
    const { location } = await isolatedStore(t);
    class NormalizedBodyStore extends FsStore {
      override async uniqueRequestIdentifiers() {
        return { method: "POST", body: "normalized" };
      }
    }
    const store = new NormalizedBodyStore({ runtime, location });
    const base = { url: "https://fmc.test/upload", method: "POST" };
    const first = { ...base, bodyBase64: "gA==" };
    const second = { ...base, bodyBase64: "gQ==" };
    expect(await store.idFromRequest(first)).toBe(
      await store.idFromRequest(second),
    );
    expect(await store.idFromRequest(first)).toBe(
      await store.idFromRequest({ ...base, bodyText: "volatile" }),
    );
    await store.storeContent(fixture(first, "normalized fixture"));
    expect(await store.fetchContent(second)).toEqual(
      fixture(first, "normalized fixture"),
    );
  });

  for (const legacy of [false, true]) {
    it(`propagates corrupt JSON and I/O errors on ${legacy ? "legacy" : "current"} paths`, async (t) => {
      const { store } = await isolatedStore(t);
      const request = { url: "https://fmc.test/a" };
      const file = legacy
        ? "fmc.test!a.json"
        : await store.idFromRequest(request);
      await fs.writeFile(
        legacy
          ? await store.cache_dir(file)
          : await store.pathFromRequest(request),
        "{ corrupt",
      );
      await expect(store.fetchContent(request)).rejects.toThrow(
        /cache file exists but is not valid JSON/,
      );
      for (const code of ["EACCES", "EIO"]) {
        const error = Object.assign(new Error(code), { code });
        let reads = 0;
        store.runtime = {
          ...runtime,
          fs: {
            ...runtime.fs,
            readFile: async () => {
              reads++;
              if (legacy && reads === 1)
                throw Object.assign(new Error("missing"), { code: "ENOENT" });
              throw error;
            },
          },
        };
        await expect(store.fetchContent(request)).rejects.toBe(error);
        expect(reads).toBe(legacy ? 2 : 1);
      }
    });
  }

  it("recognizes Deno NotFound as a cache miss", async (t) => {
    const { store } = await isolatedStore(t);
    store.runtime = {
      ...runtime,
      fs: {
        ...runtime.fs,
        readFile: async () => {
          throw Object.assign(new Error("missing"), { name: "NotFound" });
        },
      },
    };
    expect(await store.fetchContent({ url: "https://fmc.test/a" })).toBeNull();
  });

  it("skips Windows-invalid legacy bracket suffixes without probing them", async () => {
    const reads: string[] = [];
    const store = new FsStore({
      runtime: {
        ...runtime,
        path: { join: win32.join },
        fs: {
          ...runtime.fs,
          readFile: async (path) => {
            reads.push(path);
            throw Object.assign(new Error("missing"), { code: "ENOENT" });
          },
        },
      },
    });
    expect(
      await store.fetchContent({
        url: "https://fmc.test/a?q=[x:y]",
        method: "POST",
      }),
    ).toBeNull();
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain("\\fmc-v1\\");
  });
});

async function noNetwork(): Promise<Response> {
  throw new Error("unexpected network request");
}

async function isolatedStore(t: TestContext) {
  await fs.mkdir("coverage", { recursive: true });
  const location = await fs.mkdtemp("coverage/fmc-identity-");
  t.after(() => fs.rm(location, { recursive: true, force: true }));
  const cache = createFetchCache({
    Store: [FsStore, { location }],
    fetch: async (input) =>
      new Response(input instanceof Request ? input.url : String(input)),
  });
  return { cache, store: cache._store! as FsStore, location };
}

function fixture(
  request: FMCCacheContent["request"],
  body: string,
): FMCCacheContent {
  return {
    request,
    response: {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {},
      bodyText: body,
    },
  };
}

async function writeLegacy(
  store: FsStore,
  name: string,
  content: FMCCacheContent,
) {
  const text = JSON.stringify(content);
  await fs.writeFile(await store.cache_dir(name), text);
  return text;
}

describe("fsStore", () => {
  describe("standard tests", () => {
    createTestsForMock(nodeFsCacheMock);
  });

  describe("committed fixtures", () => {
    const mock = createFetchCache({
      Store: FsStore, // default location: tests/fixtures/http
      fetch: async () => {
        throw new Error("network fetch attempted — fixture should have HIT");
      },
    });

    it("serves a HIT from a committed fixture", async (t) => {
      t.mock.method(globalThis, "fetch", mock);
      const response = await fetch("https://fmc.test/text");
      const data = await response.text();
      expect(response.headers.get("X-FMC-Cache")).toBe("HIT");
      expect(data).toBe("hello");
    });
  });

  describe("error handling", () => {
    const store = nodeFsCacheMock._store! as FsStore;

    it("missing file returns null (cache miss)", async () => {
      const request = {
        url: "https://fmc.test/does-not-exist",
        method: "GET",
      };
      const content = await store.fetchContent(request);
      expect(content).toBeNull();
    });

    it("corrupt file throws a helpful error", async () => {
      const request = {
        url: "https://fmc.test/corrupt-json",
        method: "GET",
      };
      const path = await store.pathFromRequest(request);
      const pathParts = path.split("/");
      pathParts.pop();
      await fs.mkdir(pathParts.join("/"), { recursive: true });
      await fs.writeFile(path, "{ not json");

      await expect(store.fetchContent(request)).rejects.toThrow(
        /cache file exists but is not valid JSON/,
      );
    });
  });
});
