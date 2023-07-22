import fetchMock from "jest-fetch-mock";
import { fetchContent, storeContent } from "./node";

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

export default function createCachingMock() {
  const implementation = async function cachingMockImplementation(
    urlOrRequest: string | Request | undefined,
    options: RequestInit | undefined,
  ) {
    if (!urlOrRequest) throw new Error("urlOrRequest is undefined");

    const url =
      typeof urlOrRequest === "string" ? urlOrRequest : urlOrRequest?.url;

    const existingContent = await implementation.fetchContent(url);
    if (existingContent) {
      const parsed = JSON.parse(existingContent);
      const bodyText = parsed.response.bodyJson
        ? JSON.stringify(parsed.response.bodyJson)
        : parsed.response.bodyText;
      return new Response(bodyText, {
        status: parsed.response.status,
        statusText: parsed.response.statusText,
        headers: new Headers(parsed.response.headers),
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

    await implementation.storeContent(url, newContent);

    return new Response(bodyText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  implementation.fetchContent = fetchContent;
  implementation.storeContent = storeContent;
  return implementation;
}
