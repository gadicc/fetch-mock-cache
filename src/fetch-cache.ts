import _debug from "debug";
import { deserializeBody, serializeBody } from "./body.js";
import type { FMCCacheContent } from "./cache.js";
import {
  DEFAULT_REDACTED_HEADERS,
  deserializeHeaders,
  redactHeaders as redactHeadersHelper,
  serializeHeaders,
} from "./headers.js";
import type FMCStore from "./store.js";
import {
  DEFAULT_REDACTED_SEARCH_PARAMS,
  redactSearchParams as redactUrlSearchParams,
} from "./url.js";

const debug = _debug("fetch-mock-cache:core");
const origFetch = fetch;
const VALID_FETCH_CACHE_MODES = ["auto", "replay", "record", "off"] as const;

export type FetchCacheMode = (typeof VALID_FETCH_CACHE_MODES)[number];

type ReadCacheOption =
  | boolean
  | Promise<boolean>
  | ((
      ...args: Parameters<FMCStore["fetchContent"]>
    ) => boolean | Promise<boolean>);

type WriteCacheOption =
  | boolean
  | Promise<boolean>
  | ((
      ...args: Parameters<FMCStore["storeContent"]>
    ) => boolean | Promise<boolean>);

type FetchCacheModeDefaults = {
  readCache: boolean;
  writeCache: boolean;
  throwOnMiss: boolean;
};

const FETCH_CACHE_MODE_DEFAULTS: Record<
  FetchCacheMode,
  FetchCacheModeDefaults
> = {
  auto: { readCache: true, writeCache: true, throwOnMiss: false },
  replay: { readCache: true, writeCache: false, throwOnMiss: true },
  record: { readCache: false, writeCache: true, throwOnMiss: false },
  off: { readCache: false, writeCache: false, throwOnMiss: false },
};

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
  /** Cache behavior mode. Defaults to `auto`. */
  mode?: FetchCacheMode;
  /** True (default): use cached response if available; false: always fetch from network.
   * You can also provide a promise or function that returns a boolean or promise.
   */
  readCache?: ReadCacheOption;
  /** If a fetch was performed, should we write it to the cache?  Can be a boolean, a
   * promise, or a function that returns a boolean or promise.  In the case of a promise,
   * the write will open occur when the promise resolves, and AFTER the response is
   * returned.  This allows for more complex patterns, where e.g. you could rely on the
   * further processing of the response in other functions before deciding whether to
   * cache it or not, but does require some extra care.
   */
  writeCache?: WriteCacheOption;
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
  options: FetchCacheOptions;
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
  /** Global default cache options. These can be changed later via fetchCache.options. */
  id?: FetchCacheOptions["id"];
  mode?: FetchCacheOptions["mode"];
  readCache?: FetchCacheOptions["readCache"];
  writeCache?: FetchCacheOptions["writeCache"];
  /** Header names to redact from cached content (and cache-key hashes).
   * Defaults to DEFAULT_REDACTED_HEADERS.  Pass `false` to disable
   * redaction entirely, or an array to replace the default list. */
  redactHeaders?: string[] | false;
  /** Query param names whose values are redacted from cached URLs —
   * fixture filenames, stored content, and cache-key derivation all see
   * the redacted URL; the real network request is unaffected.  Defaults
   * to DEFAULT_REDACTED_SEARCH_PARAMS.  Pass `false` to disable, or an
   * array to replace the default list. */
  redactSearchParams?: string[] | false;
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
  id,
  mode,
  readCache,
  writeCache,
  redactHeaders,
  redactSearchParams,
}: CreateFetchCacheOptions) {
  if (!Store) {
    throw new Error(
      "No `Store` option was provided, but is required.  See docs.",
    );
  }
  if (!fetch) fetch = origFetch;

  const redactList =
    redactHeaders === false
      ? null
      : (redactHeaders ?? DEFAULT_REDACTED_HEADERS);

  const paramRedactList =
    redactSearchParams === false
      ? null
      : (redactSearchParams ?? DEFAULT_REDACTED_SEARCH_PARAMS);

  const serializeAndRedactHeaders = (headers: Headers) => {
    const serialized = serializeHeaders(headers);
    return redactList
      ? redactHeadersHelper(serialized, redactList)
      : serialized;
  };

  // Init with options if passed as [ Store, { /* ... */ } ]
  const store: FMCStore = Array.isArray(Store)
    ? new Store[0]({ ...Store[1], runtime })
    : new Store({ runtime });
  const defaultOptions = mergeFetchCacheOptions({
    id,
    mode,
    readCache,
    writeCache,
  });

  const fetchCache: FetchCache = Object.assign(
    async function cachingMockImplementation(
      urlOrRequest: string | Request | URL | undefined,
      requestInit: RequestInit | undefined,
    ) {
      if (!urlOrRequest) throw new Error("urlOrRequest is undefined");

      const onceOptions = Array.isArray(fetchCache._options)
        ? fetchCache._options.shift()
        : fetchCache._options;
      const modeResolution = resolveFetchCacheMode(
        onceOptions,
        fetchCache.options,
        runtime,
      );
      const modeDefaults = FETCH_CACHE_MODE_DEFAULTS[modeResolution.mode];
      const options = mergeFetchCacheOptions(fetchCache.options, onceOptions);
      const writeCache = resolveOptionWithModeDefaults(
        "writeCache",
        onceOptions,
        fetchCache.options,
        modeResolution.sourcePriority,
        modeDefaults.writeCache,
      );

      const fetchRequest =
        typeof urlOrRequest === "string" || urlOrRequest instanceof URL
          ? new Request(urlOrRequest, requestInit)
          : urlOrRequest;

      const url = fetchRequest.url;
      const cacheUrl = paramRedactList
        ? redactUrlSearchParams(url, paramRedactList)
        : url;

      const clonedRequest = fetchRequest.clone();
      const cacheContentRequest: FMCCacheContent["request"] = {
        url: cacheUrl,
        method: fetchRequest.method,
        ...(clonedRequest.body && (await serializeBody(clonedRequest))),
        ...(Array.from(fetchRequest.headers.keys()).length > 0 && {
          // Not really necessary as set-cookie never appears in the REQUEST headers.
          headers: serializeAndRedactHeaders(fetchRequest.headers),
        }),
      };

      const readCache = await resolveReadCacheOption(
        resolveOptionWithModeDefaults(
          "readCache",
          onceOptions,
          fetchCache.options,
          modeResolution.sourcePriority,
          modeDefaults.readCache,
        ),
        cacheContentRequest,
        options,
      );

      const existingContent =
        readCache && (await store.fetchContent(cacheContentRequest, options));

      if (existingContent) {
        debug("Using cached copy of %o", cacheUrl);
        const headers = deserializeHeaders(existingContent.response.headers);
        headers.set("X-FMC-Cache", "HIT");

        return new Response(await deserializeBody(existingContent.response), {
          status: existingContent.response.status,
          statusText: existingContent.response.statusText,
          headers,
        });
      }

      if (modeDefaults.throwOnMiss && readCache) {
        throw await replayMissError(store, cacheContentRequest, options);
      }

      debug("Fetching %o", cacheUrl);

      const response =
        typeof urlOrRequest === "string" || urlOrRequest instanceof URL
          ? await fetch(urlOrRequest, requestInit)
          : await fetch(fetchRequest);

      const newContent: FMCCacheContent = {
        request: cacheContentRequest,
        response: {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: serializeAndRedactHeaders(response.headers),
          ...(await serializeBody(response)),
        },
      };

      const resolvedWriteCache =
        typeof writeCache === "function"
          ? writeCache(newContent, options)
          : writeCache;

      if (resolvedWriteCache instanceof Promise) {
        resolvedWriteCache
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
      } else if (resolvedWriteCache)
        await store.storeContent(newContent, options);

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
      options: defaultOptions,
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

  return fetchCache;
}

type OptionsSourcePriority = 0 | 1 | 2;

function mergeFetchCacheOptions(
  ...sources: Array<FetchCacheOptions | undefined>
): FetchCacheOptions {
  const options: FetchCacheOptions = {};
  for (const source of sources) {
    if (!source) continue;
    if (source.id !== undefined) options.id = source.id;
    if (source.mode !== undefined) options.mode = source.mode;
    if (source.readCache !== undefined) options.readCache = source.readCache;
    if (source.writeCache !== undefined) {
      options.writeCache = source.writeCache;
    }
  }
  return options;
}

function resolveFetchCacheMode(
  onceOptions: FetchCacheOptions | undefined,
  globalOptions: FetchCacheOptions | undefined,
  runtime: Runtime,
): { mode: FetchCacheMode; sourcePriority: OptionsSourcePriority } {
  if (onceOptions?.mode !== undefined) {
    return {
      mode: parseFetchCacheMode(onceOptions.mode, "once()"),
      sourcePriority: 2,
    };
  }

  if (globalOptions?.mode !== undefined) {
    return {
      mode: parseFetchCacheMode(globalOptions.mode, "fetchCache.options"),
      sourcePriority: 1,
    };
  }

  const envMode = runtime.env.FMC_CACHE_MODE;
  if (envMode !== undefined) {
    return {
      mode: parseFetchCacheMode(envMode, "FMC_CACHE_MODE"),
      sourcePriority: 0,
    };
  }

  return { mode: "auto", sourcePriority: 0 };
}

function parseFetchCacheMode(value: string, source: string): FetchCacheMode {
  const mode = value.trim().toLowerCase();
  if (isFetchCacheMode(mode)) return mode;

  throw new Error(
    `fetch-mock-cache: invalid cache mode ${JSON.stringify(
      value,
    )} from ${source}. Valid modes: ${VALID_FETCH_CACHE_MODES.join(", ")}.`,
  );
}

function isFetchCacheMode(mode: string): mode is FetchCacheMode {
  return VALID_FETCH_CACHE_MODES.includes(mode as FetchCacheMode);
}

function resolveOptionWithModeDefaults<
  OptionName extends "readCache" | "writeCache",
>(
  optionName: OptionName,
  onceOptions: FetchCacheOptions | undefined,
  globalOptions: FetchCacheOptions | undefined,
  modeSourcePriority: OptionsSourcePriority,
  defaultValue: boolean,
): NonNullable<FetchCacheOptions[OptionName]> {
  if (onceOptions?.[optionName] !== undefined && modeSourcePriority <= 2) {
    return onceOptions[optionName];
  }

  if (globalOptions?.[optionName] !== undefined && modeSourcePriority <= 1) {
    return globalOptions[optionName];
  }

  return defaultValue as NonNullable<FetchCacheOptions[OptionName]>;
}

async function resolveReadCacheOption(
  readCache: NonNullable<FetchCacheOptions["readCache"]>,
  request: FMCCacheContent["request"],
  options: FetchCacheOptions,
): Promise<boolean> {
  if (typeof readCache === "function") {
    return await readCache(request, options);
  }

  return await readCache;
}

async function replayMissError(
  store: FMCStore,
  request: FMCCacheContent["request"],
  options: FetchCacheOptions,
): Promise<Error> {
  const storeName = store.constructor.name || "FMCStore";
  const storeLocation =
    "_location" in store && typeof store._location === "string"
      ? ` (location: ${store._location})`
      : "";
  const method = request.method || "GET";
  const cacheId = await store.idFromRequest(request, options);

  return new Error(
    [
      `fetch-mock-cache: cache miss in replay mode for ${method} ${request.url}`,
      `Store: ${storeName}${storeLocation}`,
      `Computed cache id: ${cacheId}`,
      'To record this fixture, set FMC_CACHE_MODE=record or createFetchCache({ mode: "record" }).',
    ].join("\n"),
  );
}
