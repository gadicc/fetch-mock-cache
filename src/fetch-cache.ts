import _debug from "debug";
import type { FMCCacheContent } from "./cache.js";
import { serializeHeaders, unserializeHeaders } from "./headers.js";
import FMCStore from "./store.js";

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
  id?: string;
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
  if (!Store)
    throw new Error(
      "No `Store` option was provided, but is required.  See docs.",
    );
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
      const options = Array.isArray(fetchCache._options)
        ? fetchCache._options.shift()
        : fetchCache._options;

      const fetchRequest =
        typeof urlOrRequest === "string" || urlOrRequest instanceof URL
          ? new Request(urlOrRequest, requestInit)
          : urlOrRequest;

      const url = fetchRequest.url;

      const clonedRequest = fetchRequest.clone();
      const cacheContentRequest: FMCCacheContent["request"] = {
        url,
        method: fetchRequest.method,
      };

      if (Array.from(fetchRequest.headers.keys()).length > 0) {
        // Not really necessary as set-cookie never appears in the REQUEST headers.
        cacheContentRequest.headers = serializeHeaders(fetchRequest.headers);
      }

      if (clonedRequest.body) {
        const bodyText = await clonedRequest.text();
        if (
          clonedRequest.headers
            .get("Content-Type")
            ?.startsWith("application/json")
        )
          cacheContentRequest.bodyJson = JSON.parse(bodyText);
        else cacheContentRequest.bodyText = bodyText;
      }

      const existingContent = await store.fetchContent(
        cacheContentRequest,
        options,
      );
      if (existingContent) {
        debug("Using cached copy of %o", url);
        const bodyText = existingContent.response.bodyJson
          ? JSON.stringify(existingContent.response.bodyJson)
          : existingContent.response.bodyText;

        existingContent.response.headers["X-FMC-Cache"] = "HIT";

        return new Response(bodyText, {
          status: existingContent.response.status,
          statusText: existingContent.response.statusText,
          headers: unserializeHeaders(existingContent.response.headers),
        });
      }

      debug("Fetching and caching %o", url);

      const p = fetch(url, requestInit);
      const response = await p;

      const newContent: FMCCacheContent = {
        request: cacheContentRequest,
        response: {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: serializeHeaders(response.headers),
        },
      };

      const bodyText = await response.text();
      if (response.headers.get("Content-Type")?.startsWith("application/json"))
        newContent.response.bodyJson = JSON.parse(bodyText);
      else newContent.response.bodyText = bodyText;

      await store.storeContent(newContent, options);

      const headers = new Headers(response.headers);
      headers.set("X-FMC-Cache", "MISS");

      return new Response(bodyText, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
    {
      runtime,
      _store: store,
      _options: [] as FetchCacheOptions[], // TODO
      _once(options: FetchCacheOptions) {
        if (!Array.isArray(this._options)) this._options = [];
        this._options.push(options);
      },
    },
  );

  // store.setFetchCache(fetchCache);

  return fetchCache;
}
