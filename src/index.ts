import fetchMock from "jest-fetch-mock";
import type { JFMCStore } from "./store";

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

    const url =
      typeof urlOrRequest === "string" ? urlOrRequest : urlOrRequest?.url;

    const existingContent = await store.fetchContent(url);
    if (existingContent) {
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

    await store.storeContent(url, newContent);

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
