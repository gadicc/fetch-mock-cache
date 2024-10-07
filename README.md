# fetch-mock-cache

Caching mock fetch implementation for all runtimes and frameworks.

Copyright (c) 2023 by Gadi Cohen. [MIT Licensed](./LICENSE.txt).

![npm](https://img.shields.io/npm/v/jest-fetch-mock-cache) ![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/gadicc/jest-fetch-mock-cache/release.yml) ![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/gadicc/26d0f88b04b6883e1a6bba5b9b344fab/raw/jest-coverage-comment__main.json) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release) [![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/) [![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## Introduction

Instead of individually handcrafting a mock for each and every `fetch()`
call in your code, maybe you'd like to perform a real `fetch()` once,
cache the result, and use that cache result for future calls. **Super
useful for TDD against existing APIs!!**

Note: v3 is active development. v2 (csm & jest only) is more stable but
is no longer being worked on. See [MIGRATING.md](./MIGRATING.md) for how
to upgrade. v3 works but you may want to wait a bit before any serious
use. Feature requests welcome!

## Quick Start

Generally your code will look something like this, but, **see further below**
for the exact code for different runtimes and testing frameworks.

```ts
import createCachingMock from "fetch-mock-cache";
// See list of possible stores, below.
import Store from "fetch-mock-cache/lib/stores/nodeFs";

const fetchCache = createCachingMock({ store: new Store() });

describe("cachingMock", () => {
  it("works with a JSON response", async (t) => {
    const url = "http://echo.jsontest.com/key/value/one/two";
    const expectedResponse = { one: "two", key: "value" };
    t.mock.method(globalThis, "fetch", fetchCache);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-JFMC-Cache")).toBe(expectedCacheHeader);
      expect(data).toEqual(expectedResponse);
    }
  });
});
```

- The **first** time this runs, a _real_ request will be made to
  `jsontest.com`, and the result returned. But, it will also be
  saved to cache.

- **Subsequent requests** will return the cached copy without
  making an HTTP request.

## Supported runtimes and test frameworks

Click on the "Quick Start / Example" links to see a working implementation for your framework of choice.

| Runtime                         | Framework                                       | Status | Quick Start / Example                                                                                                                           |
| ------------------------------- | ----------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [Node](https://nodejs.org/) 20+ | [`node:test`](https://nodejs.org/api/test.html) |        | [direct](./tests/runtimes/node/src/native-direct-mock.spec.ts) or with [fetch-mock](./tests/runtimes/node/src/native-fetch-mock.spec.ts)        |
|                                 | [`jest`](https://jestjs.io/)                    |        | [direct](./tests/runtimes/node/src/jest-direct-mock.spec.ts) or with [jest-fetch-mock](./tests/runtimes/node/src/jest-fetch-mock.spec.ts)       |
|                                 | [`vitest`](https://vitest.dev/)                 |        | [direct](./tests/runtimes/node/src/vitest-direct-mock.spec.ts) or with [vitest-fetch-mock](./tests/runtimes/node/src/vitest-fetch-mock.spec.ts) |
| [Deno](https://deno.com/)       |
| [Bun](https://bun.sh/)          |

## What's cached

Sample output from the Quick Start code above, when used with `NodeFSStore`:

```bash
$ cat tests/fixtures/http/echo.jsontest.com\!key\!value\!one\!two
```

```js
{
  "request": {
    "url": "http://echo.jsontest.com/key/value/one/two"
  },
  "response": {
    "ok": true,
    "status": 200,
    "statusText": "OK",
    "headers": {
      "access-control-allow-origin": "*",
      "connection": "close",
      "content-length": "39",
      "content-type": "application/json",
      "date": "Fri, 21 Jul 2023 16:59:17 GMT",
      "server": "Google Frontend",
      "x-cloud-trace-context": "344994371e51195ae21f236e5d7650c4"
    },
    "bodyJson": {
      "one": "two",
      "key": "value"
    }
  }
}
```

For non-JSON bodies, a `bodyText` is stored as a string. We store an
object as `bodyJson` for readability reasons.

## Debugging

We use [debug](https://www.npmjs.com/package/debug) for debugging. E.g.:

```bash
$ DEBUG=fetch-mock-cache:* yarn test
yarn run v1.22.19
$ jest
  fetch-mock-cache:core Fetching and caching 'http://echo.jsontest.com/key/value/one/two' +0ms
  fetch-mock-cache:core Using cached copy of 'http://echo.jsontest.com/key/value/one/two' +177ms
 PASS  src/index.spec.ts
  cachingMock
    ✓ should work (180 ms)
```

## Available Stores

```ts
import createCachingMock from "fetch-mock-cache";

// Use Node's FS API to store as (creating paths as necessary)
// `${process.cwd()}/tests/fixtures/${filenamifyUrl(url)}`.
// https://github.com/sindresorhus/filenamify-url
import FMCNodeFSStore from "./stores/nodeFs";
const fileCacheMock = createCachingMock({ store: new FMCNodeFSStore() });
fetchMock.mockImplementationOnce(fileCacheMock);
// To override the store location, init with store with e.g.:
// new JFMCNodeFSStore({ location: "tests/other/location" })

// Keep in memory
import FMCMemoryStore from "./stores/memory";
const memoryCacheMock = createCachingMock({ store: new JSMCMemoryStore() });
fetchMock.mockImplementationOnce(memoryCacheMock);
```

### Create your own Store

```ts
import FMCStore from "fetch-mock-cache/lib/store";
import type { FMCCacheContent } from "jest-fetch-mock-cache/lib/store";
import db from "./db"; // your existing db

class MyCustomStore extends FMCStore {
  async fetchContent(
    request: FMCCacheContent["request"],
  ): Promise<FMCCacheContent | undefined> {
    const key = await this.idFromRequest(request);
    return (await db.collection("fmc").findOne({ _id: key })).content;
  }

  async storeContent(content: FMCCacheContent): Promise<void> {
    const key = await this.idFromRequest(content.request);
    await db.collection("jfmc").insertOne({ _id: key, content });
  }
}

export default MyCustomStore;
```

## TODO

- [x] Cache request headers too and hash them in filename / key / id.
- [ ] Browser-environment support. Please open an issue if you need this, and in what cases. jsdom?
- [ ] Handle and store invalid JSON too?
