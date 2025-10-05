import _debug from "debug";
import { deserializeBody, serializeBody } from "./body.js";
import type { FMCCacheContent } from "./cache.js";
import { deserializeHeaders, serializeHeaders } from "./headers.js";
import type FMCStore from "./store.js";

const debug = _debug("fetch-mock-cache:core");
const origFetch = fetch;

/**
 * A runtime interface with the required subset of built-in runtime functions
 * needed for fech-mock-cache, e.g. `env`, `sha256`, `fs`, `path`, `cwd`.
 */
export interface Runtime {
  name: string;
  env: Record<string, string | undefined>;
  sha256(input: string, length?: number): Promise<string>;
  fs: {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    mkdir(
      path: string,
      options: { recursive?: boolean },
    ): Promise<string | undefined | void>;
  };
  path: {
    join(...paths: string[]): string;
  };
  cwd: () => string;
}

/**
 * Options to control the behaviour of the `fetch()` calls.
 * Can be passed with experimental fetch._once(options).
 */
export interface FetchCacheOptions {
  /** Manually specify a cache key (usually auto computed from URL) */
  id?: string;
  /** True (default): use cached response if available; false: always fetch from network.
   * You can also provide a promise or function that returns a boolean or promise.
   */
  readCache?:
    | boolean
    | Promise<boolean>
    | ((...args: Parameters<FMCStore["fetchContent"]>) => Promise<boolean>);
  /** If a fetch was performed, should we write it to the cache?  Can be a boolean, a
   * promise, or a function that returns a boolean or promise.  In the case of a promise,
   * the write will open occur when the promise resolves, and AFTER the response is
   * returned.  This allows for more complex patterns, where e.g. you could rely on the
   * further processing of the response in other functions before deciding whether to
   * cache it or not, but does require some extra care.
   */
  writeCache?:
    | boolean
    | Promise<boolean>
    | ((...args: Parameters<FMCStore["storeContent"]>) => Promise<boolean>);
}

/**
 * Function signature for the created `fetch` / `fetchCache` function.
 * Used to make sure the runtime implementation is compliant.
 */
export interface FetchCache {
  (
    urlOrRequest: string | Request | URL | undefined,
    options: RequestInit | undefined,
  ): Promise<Response>;

  runtime: Runtime;
  _options?: FetchCacheOptions | FetchCacheOptions[];
  _store?: FMCStore;
  once: (options: FetchCacheOptions) => void;
  /** @deprecated Use once() instead */
  _once: (options: FetchCacheOptions) => void;
}

/**
 * Options for `createFetchCache`.  `Store` is required.  `runtime` is
 * generally passed automatically by each runtime entry point.  `fetch`
 * is optional and defaults to the built-in `fetch` as available at
 * module load time.
 */
export interface CreateFetchCacheOptions {
  runtime: Runtime;
  Store?: typeof FMCStore | [typeof FMCStore, Record<string, unknown>];
  fetch?: typeof origFetch;
}

/**
 * Creates a new caching fetch implementation.  Generally not used directly,
 * instead use the same named function provided by the various run-time entry
 * points.
 */
export default function createCachingMock({
  Store,
  fetch,
  runtime,
}: CreateFetchCacheOptions) {
  if (!Store) {
    throw new Error(
      "No `Store` option was provided, but is required.  See docs.",
    );
  }
  if (!fetch) fetch = origFetch;

  // Init with options if passed as [ Store, { /* ... */ } ]
  const store: FMCStore = Array.isArray(Store)
    ? new Store[0]({ ...Store[1], runtime })
    : new Store({ runtime });

  const fetchCache: FetchCache = Object.assign(
    async function cachingMockImplementation(
      urlOrRequest: string | Request | URL | undefined,
      requestInit: RequestInit | undefined,
    ) {
      if (!urlOrRequest) throw new Error("urlOrRequest is undefined");

      // TODO, main options?  merge?
      const options =
        (Array.isArray(fetchCache._options)
          ? fetchCache._options.shift()
          : fetchCache._options) || {};

      let readCache = "readCache" in options ? options.readCache : true;
      let writeCache = "writeCache" in options ? options.writeCache : true;

      const fetchRequest =
        typeof urlOrRequest === "string" || urlOrRequest instanceof URL
          ? new Request(urlOrRequest, requestInit)
          : urlOrRequest;

      const url = fetchRequest.url;

      const clonedRequest = fetchRequest.clone();
      const cacheContentRequest: FMCCacheContent["request"] = {
        url,
        method: fetchRequest.method,
        ...(clonedRequest.body && (await serializeBody(clonedRequest))),
        ...(Array.from(fetchRequest.headers.keys()).length > 0 && {
          // Not really necessary as set-cookie never appears in the REQUEST headers.
          headers: serializeHeaders(fetchRequest.headers),
        }),
      };

      if (typeof readCache === "function") {
        readCache = await readCache(cacheContentRequest, options);
      }

      const existingContent = readCache &&
        (await store.fetchContent(cacheContentRequest, options));

      if (existingContent) {
        debug("Using cached copy of %o", url);
        existingContent.response.headers["X-FMC-Cache"] = "HIT";

        return new Response(await deserializeBody(existingContent.response), {
          status: existingContent.response.status,
          statusText: existingContent.response.statusText,
          headers: deserializeHeaders(existingContent.response.headers),
        });
      }

      debug("Fetching %o", url);

      const p = fetch(url, requestInit);
      const response = await p;

      const newContent: FMCCacheContent = {
        request: cacheContentRequest,
        response: {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: serializeHeaders(response.headers),
          ...(await serializeBody(response)),
        },
      };

      if (typeof writeCache === "function") {
        writeCache = writeCache(newContent, options);
      }

      if (writeCache instanceof Promise) {
        writeCache
          .then(async (shouldWrite: boolean) => {
            if (shouldWrite) {
              await store.storeContent(newContent, options);
            }
          })
          .catch((error) => {
            console.error(
              "Error occurred while deciding to cache response: %o",
              error,
            );
          });
      } else if (writeCache) await store.storeContent(newContent, options);

      const headers = new Headers(response.headers);
      headers.set("X-FMC-Cache", "MISS");

      return new Response(await deserializeBody(newContent.response), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
    {
      runtime,
      _store: store,
      _options: [] as FetchCacheOptions[], // TODO
      once(options: FetchCacheOptions) {
        if (!Array.isArray(this._options)) this._options = [];
        this._options.push(options);
      },
      _once(options: FetchCacheOptions) {
        console.warn(
          "_fetchCache._once() is deprecated, use _fetchCache.once()",
        );
        return this.once(options);
      },
    },
  );

  // store.setFetchCache(fetchCache);

  return fetchCache;
}
