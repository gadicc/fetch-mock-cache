# jest-fetch-mock-cache

Caching mock implementation for jest-fetch-mock.

Copyright (c) 2023 by Gadi Cohen. [MIT Licensed](./LICENSE.txt).

![npm](https://img.shields.io/npm/v/jest-fetch-mock-cache) ![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/gadicc/jest-fetch-mock-cache/release.yml) ![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/gadicc/26d0f88b04b6883e1a6bba5b9b344fab/raw/jest-coverage-comment__main.json) ![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)

## Introduction

Instead of individually handcrafting a mock for each and every `fetch()`
call in your code, maybe you'd like to perform a real `fetch()` once,
cache the result, and use that cache result for future calls. **Super
useful for writing tests against existing APIs!!**

Note: this is a brand new project. It works but you may want to wait
a little before any serious use. Feature requests welcome!

## Quick Start

```ts
import fetchMock from "jest-fetch-mock";
fetchMock.enableMocks();

import { describe, expect, test as it } from "@jest/globals";
import createCachingMock from "jest-fetch-mock-cache";

describe("cachingMock", () => {
  it("should work", async () => {
    fetchMock.mockImplementationOnce(createCachingMock());

    const response = await fetch("http://echo.jsontest.com/key/value/one/two");
    const data = await response.json();

    expect(data).toEqual({
      one: "two",
      key: "value",
    });
  });
});
```

- The **first** time this runs, a _real_ request will be made to
  `jsontest.com`, and the result returned. But, it will also be
  saved to cache.

- **Subsequent requests** will return the cached copy without
  making an HTTP request.

## What's cached

Sample output from the Quick Start code above.

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

## DEBUGGING

We use [debug](https://www.npmjs.com/package/debug) for debugging. E.g.:

```bash
$ DEBUG=jest-fetch-mock-cache yarn test
yarn run v1.22.19
$ jest
 PASS  src/index.spec.ts
  cachingMock
    ✓ should work (5 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        1.026 s, estimated 2 s
Ran all test suites.
Done in 1.45s.
```

```bash
$ DEBUG=jest-fetch-mock-cache:* yarn test
yarn run v1.22.19
$ jest
  jest-fetch-mock-cache:node [jsmc] Using cached copy of 'http://echo.jsontest.com/key/value/one/two' +0ms
 PASS  src/index.spec.ts
  cachingMock
    ✓ should work (7 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        1.018 s
Ran all test suites.
Done in 1.46s.
```

## TODO

- [ ] Browser-environment support. Please open an issue if you need this, and in what cases. jsdom?
- [ ] Cache request headers too and hash them in filename.
- [ ] Allow custom caches and cache behaviours.
