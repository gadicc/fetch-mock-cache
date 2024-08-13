import fetchMock from "jest-fetch-mock";
import _debug from "debug";
import type { JFMCCacheContent } from "./cache";
import { serializeHeaders, unserializeHeaders } from "./headers";
import JFMCNodeFSStore from "./stores/nodeFs";
export { JFMCNodeFSStore as NodeFSStore };
import JFMCStore from "./store";

const debug = _debug("jest-fetch-mock-cache:core");

export function createCachingMock({ store }: { store?: JFMCStore } = {}) {
  if (!store)
    throw new Error(
      "No `store` option was provided, but is required.  See docs.",
    );

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
    const cacheContentRequest: JFMCCacheContent["request"] = {
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
      debug("[jsmc] Using cached copy of %o", url);
      const bodyText = existingContent.response.bodyJson
        ? JSON.stringify(existingContent.response.bodyJson)
        : existingContent.response.bodyText;

      existingContent.response.headers["X-JFMC-Cache"] = "HIT";

      return new Response(bodyText, {
        status: existingContent.response.status,
        statusText: existingContent.response.statusText,
        headers: unserializeHeaders(existingContent.response.headers),
      });
    }

    debug("[jsmc] Fetching and caching %o", url);

    fetchMock.disableMocks();
    const p = fetch(url, options);
    fetchMock.enableMocks();
    const response = await p;

    const newContent: JFMCCacheContent = {
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

    response.headers.set("X-JFMC-Cache", "MISS");

    return new Response(bodyText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

export default createCachingMock;
