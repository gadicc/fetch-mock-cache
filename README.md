# fetch-mock-cache

Caching mock fetch implementation for all runtimes and frameworks.

Copyright (c) 2023 by Gadi Cohen. [MIT Licensed](./LICENSE.txt).

[![NPM Version](https://img.shields.io/npm/v/fetch-mock-cache?logo=npm)](https://www.npmjs.com/package/fetch-mock-cache)
[![JSR](https://jsr.io/badges/@gadicc/fetch-mock-cache)](https://jsr.io/@gadicc/fetch-mock-cache)
[![JSR Score](https://jsr.io/badges/@gadicc/fetch-mock-cache/score)](https://jsr.io/@gadicc/fetch-mock-cache)
![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/gadicc/jest-fetch-mock-cache/release.yml)
![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/gadicc/26d0f88b04b6883e1a6bba5b9b344fab/raw/fetch-mock-cache-lcov-coverage.json)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## Introduction

Instead of individually handcrafting a mock for each and every `fetch()`
call in your code, maybe you'd like to perform a real `fetch()` once,
cache the result, and use that cache result for future calls. **Super
useful for TDD against existing APIs!!** ("Test Driven Development").

Not only do you get a muuuch faster feedback loop, but you can commit
the cache to your repository / source control so your entire team
benefits, and for CI. Based off earlier work in
[yahoo-finance2](https://www.npmjs.com/package/yahoo-finance2) where
we test 1400+ API "calls" in < 3s on every commit. Feature requests welcome!

NB: if you're still using **v1** (formerly `jest-fetch-mock-cache`),
see the [old README](https://github.com/gadicc/fetch-mock-cache/tree/1.x)
and/or [MIGRATING.md](./MIGRATING.md) for how to upgrade.

## Quick Start

Generally your code will look something like this, but,
[**see further below**](#runtimes)
for the exact code for different runtimes and testing frameworks.

```ts
import createFetchCache from "fetch-mock-cache";
// See list of possible stores, below.
import Store from "fetch-mock-cache/lib/stores/fs";

const fetchCache = createFetchCache({ Store });

describe("cachingMock", () => {
  it("works with a JSON response", async (t) => {
    const url = "http://echo.jsontest.com/key/value/one/two";
    const expectedResponse = { one: "two", key: "value" };
    t.mock.method(globalThis, "fetch", fetchCache);

    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      const data = await response.json();
      const expectedCacheHeader = i === 0 ? "MISS" : "HIT";
      expect(response.headers.get("X-FMC-Cache")).toBe(expectedCacheHeader);
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

- **Commit `tests/fixtures/http`** (default) to your repo for
  super fast tests in the future for all contributors and CI.

<a name="runtimes"></a>

## Supported runtimes and test frameworks

Click on the "Quick Start / Example" links to see a working implementation for your framework of choice.

| Runtime                         | Framework                                                          | Status                                                                                                                                                                                                                                                                                     | Quick Start / Example                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [Node](https://nodejs.org/) 20+ | [`node:test`](https://nodejs.org/api/test.html)                    | ![Dynamic YAML Badge](https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fgist.githubusercontent.com%2Fgadicc%2Ff66f0ad9395e4019ec5209719377650b%2Fraw%2Fedbb28289e9c452d4d1f482454dd02ff41a8b255%2Fresults.yaml&query=%24.node.native&logo=nodedotjs&label=%20&labelColor=%23ddd) | [direct](./tests/runtimes/node/src/native-direct-mock.spec.ts) or with [fetch-mock](./tests/runtimes/node/src/native-fetch-mock.spec.ts)        |
|                                 | [`jest`](https://jestjs.io/)                                       | ![Dynamic YAML Badge](https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fgist.githubusercontent.com%2Fgadicc%2Ff66f0ad9395e4019ec5209719377650b%2Fraw%2Fedbb28289e9c452d4d1f482454dd02ff41a8b255%2Fresults.yaml&query=%24.node.jest&logo=jest&label=%20&labelColor=%23aaa)        | [direct](./tests/runtimes/node/src/jest-direct-mock.spec.ts) or with [jest-fetch-mock](./tests/runtimes/node/src/jest-fetch-mock.spec.ts)       |
|                                 | [`vitest`](https://vitest.dev/)                                    | ![Dynamic YAML Badge](https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fgist.githubusercontent.com%2Fgadicc%2Ff66f0ad9395e4019ec5209719377650b%2Fraw%2Fedbb28289e9c452d4d1f482454dd02ff41a8b255%2Fresults.yaml&query=%24.node.vitest&logo=vitest&label=%20&labelColor=%23ddd)    | [direct](./tests/runtimes/node/src/vitest-direct-mock.spec.ts) or with [vitest-fetch-mock](./tests/runtimes/node/src/vitest-fetch-mock.spec.ts) |
| [Deno](https://deno.com/)       | [`deno test`](https://docs.deno.com/runtime/fundamentals/testing/) | ![Dynamic YAML Badge](https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fgist.githubusercontent.com%2Fgadicc%2Ff66f0ad9395e4019ec5209719377650b%2Fraw%2Fedbb28289e9c452d4d1f482454dd02ff41a8b255%2Fresults.yaml&query=%24.deno.native&logo=deno&label=%20&labelColor=%23aaa)      | [direct](./tests/runtimes/deno/src/direct-mock.test.ts)                                                                                         |
| [Bun](https://bun.sh/)          | [`bun:test`](https://bun.sh/docs/cli/test)                         | ![Dynamic YAML Badge](https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fgist.githubusercontent.com%2Fgadicc%2Ff66f0ad9395e4019ec5209719377650b%2Fraw%2Fedbb28289e9c452d4d1f482454dd02ff41a8b255%2Fresults.yaml&query=%24.bun.native&logo=bun&label=%20&labelColor=%23aaa)        | [direct](./tests/runtimes/bun/src/direct.spec.ts), maybe soon [`bun-bagel`](https://github.com/DRFR0ST/bun-bagel)                               |

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

- [`stores/fs`](./src/stores/fs.ts) - use your runtime's FileSystem API to
  store cached requests to the filesystem, for persistance. These can be
  committed to your projects repository / source control for faster future
  testing, including for CI.

- [`stores/memory`](./src/stores/memory.ts) - keep the cache in memory.
  The cache will not persist and will be created again from scratch each
  time you run your code.

### Create your own Store

See also the [`store`](./src/store.ts) "root" class. Don't instantiate
directly; rather extend this class overriding at least `fetchContent` and
`storeContent`, and perhaps, `idFromRequest`, the constructor and others
according to your needs. Here's an example to combine with a database:

```ts
import FMCStore from "fetch-mock-cache/store";
import type { FMCCacheContent, FMCStoreOptions } from "fetch-mock-cache/store";
import db from "./db"; // your existing db

export default class MyStore extends FMCStore {
  async fetchContent(req: FMCCacheContent["request"]) {
    const _id = await this.idFromRequest(request);
    return (await db.collection("fmc").findOne({ _id })).content;
  }
  async storeContent(content: FMCCacheContent) {
    const _id = await this.idFromRequest(content.request);
    await db.collection("jfmc").insertOne({ _id, content });
  }
}
```

## Internal and Experimental Features

Internal and experimental features are generally prefixed by an underscore ("`_`").
You're welcome to use them, however, they are not part of our API contract - as such,
they may change or disappear at any time, _without following semantic versioning_.

Often these are used for new ideas that are still in development, where, we'd like
you to have easy access to them (and appreciate your feedback!), but, they're not
(yet) considered stable.

Current experiments:

### Passing options to be used for the next fetch call

```ts
// These will be used for the next fetch call ONCE only.  However, `_once()`
// may be called multiple times to queue options for multiple future calls.
fetchCache._once({
  /* options */
});
```

### Manually specifying an ID

Generally we don't need to think about cache IDs, as we can reliably
generate them from the `Request` object (e.g. based on URL and hashes
of the headers, body, etc.).

But sometimes, we may want to specify this manually, e.g.

1. **We'd rather use the _test name_** as the id, vs something URL-based.
2. **It can't be reliably generated**, e.g. formData with a random boundary.

In this case, we can:

```ts
fetchCache._once({ id: "mytest" });
fetch(/* ... */); // or code that uses fetch();
```

Make sure the `id` is relevant for your store. e.g. if using the fs store,
make sure `id` is a valid file name (the fs store will still append `.json`
at the end).

## TODO

- [x] Cache request headers too and hash them in filename / key / id.
- [ ] Browser-environment support. Please open an issue if you need this, and in what cases. jsdom?
- [ ] Handle and store invalid JSON too?
