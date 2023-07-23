import fetchMock from "jest-fetch-mock";
import _debug from "debug";

import type { JFMCStore } from "./store";

const debug = _debug("jest-fetch-mock-cache:core");

export interface JFMCCacheContent {
  request: { url: string };
  response: {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    bodyJson?: string;
    bodyText?: string;
  };
}

export default function createCachingMock({
  store,
}: { store?: JFMCStore } = {}) {
  if (!store)
    throw new Error(
      "No `store` option was provided, but is required.  See docs.",
    );

  return async function cachingMockImplementation(
    urlOrRequest: string | Request | undefined,
    options: RequestInit | undefined,
  ) {
    if (!urlOrRequest) throw new Error("urlOrRequest is undefined");

    const request =
      typeof urlOrRequest === "string"
        ? new Request(urlOrRequest)
        : urlOrRequest;
    const url = request.url;

    const existingContent = await store.fetchContent(request);
    if (existingContent) {
      debug("[jsmc] Using cached copy of %o", url);
      const bodyText = existingContent.response.bodyJson
        ? JSON.stringify(existingContent.response.bodyJson)
        : existingContent.response.bodyText;

      existingContent.response.headers["X-JFMC-Cache"] = "HIT";

      return new Response(bodyText, {
        status: existingContent.response.status,
        statusText: existingContent.response.statusText,
        headers: new Headers(existingContent.response.headers),
      });
    }

    debug("[jsmc] Fetching and caching %o", url);

    fetchMock.disableMocks();
    const p = fetch(url, options);
    fetchMock.enableMocks();
    const response = await p;

    const newContent: JFMCCacheContent = {
      request: { url },
      response: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      },
    };

    const bodyText = await response.text();
    if (response.headers.get("Content-Type")?.startsWith("application/json"))
      newContent.response.bodyJson = JSON.parse(bodyText);
    else newContent.response.bodyText = bodyText;

    await store.storeContent(request, newContent);

    const headersWithCacheEntry = {
      ...response.headers,
      "X-JFMC-Cache": "MISS",
    };

    return new Response(bodyText, {
      status: response.status,
      statusText: response.statusText,
      headers: headersWithCacheEntry,
    });
  };
}
