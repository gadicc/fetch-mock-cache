import _debug from "debug";
import type { FMCCacheContent } from "./cache.js";
import { serializeHeaders, unserializeHeaders } from "./headers.js";
import FMCStore from "./store.js";

const debug = _debug("fetch-mock-cache:core");
const origFetch = fetch;

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
}

export interface CachingMockImplementation {
  (
    urlOrRequest: string | Request | URL,
    options: RequestInit | undefined,
  ): Promise<Response>;
  runtime: Runtime;
}

export interface CreateCachingMockOptions {
  runtime: Runtime;
  store?: FMCStore;
  fetch?: typeof origFetch;
}

export function createCachingMock({
  store,
  fetch,
  runtime,
}: CreateCachingMockOptions) {
  if (!store)
    throw new Error(
      "No `store` option was provided, but is required.  See docs.",
    );
  if (!fetch) fetch = origFetch;

  const cachingMockImplementation: CachingMockImplementation = Object.assign(
    async function cachingMockImplementation(
      urlOrRequest: string | Request | URL,
      options: RequestInit | undefined,
    ) {
      if (!urlOrRequest) throw new Error("urlOrRequest is undefined");

      const fetchRequest =
        typeof urlOrRequest === "string" || urlOrRequest instanceof URL
          ? new Request(urlOrRequest, options)
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

      const existingContent = await store.fetchContent(cacheContentRequest);
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

      const p = fetch(url, options);
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

      await store.storeContent(newContent);

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
    },
  );

  store.fetchCache = cachingMockImplementation;
  return cachingMockImplementation;
}

export default createCachingMock;
