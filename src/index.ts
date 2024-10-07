import _debug from "debug";
import type { FMCCacheContent } from "./cache.js";
import { serializeHeaders, unserializeHeaders } from "./headers.js";
import FMCNodeFSStore from "./stores/nodeFs.js";
export { FMCNodeFSStore as NodeFSStore };
import FMCStore from "./store.js";

const debug = _debug("fetch-mock-cache:core");
const origFetch = fetch;

export function createCachingMock({
  store,
  fetch,
}: { store?: FMCStore; fetch?: typeof origFetch } = {}) {
  if (!store)
    throw new Error(
      "No `store` option was provided, but is required.  See docs.",
    );
  if (!fetch) fetch = origFetch;

  return async function cachingMockImplementation(
    urlOrRequest: string | Request | undefined,
    options: RequestInit | undefined,
  ) {
    if (!urlOrRequest) throw new Error("urlOrRequest is undefined");

    const fetchRequest =
      typeof urlOrRequest === "string"
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
  };
}

export default createCachingMock;
