# jest-fetch-mock-cache

Caching mock implementation for jest-fetch-mock.

Copyright (c) 2023 by Gadi Cohen. [MIT Licensed](./LICENSE.txt).

## Introduction

Instead of individually handcrafting a mock for each and every `fetch()`
call in your code, maybe you'd like to perform a real `fetch()` once,
cache the result, and use that cache result for future calls. **Super
useful for writing tests against existing APIs!!**

Note: this is a brand new project. It works but you may want to wait
until v1.0.0 before any serious use. Feature requests welcome!

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

## TODO

- [ ] Browser-environment support. Please open an issue if you need this, and in what cases. jsdom?
- [ ] Cache request headers too and hash them in filename.
- [ ] Allow custom caches and cache behaviours.
