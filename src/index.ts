import fetchMock from "jest-fetch-mock";
import { fetchContent, storeContent } from "./node";

export default function createCachingMock() {
  const implementation = async function cachingMockImplementation(
    urlOrRequest: string | Request | undefined,
    options: RequestInit | undefined,
  ) {
    if (!urlOrRequest) throw new Error("urlOrRequest is undefined");

    const url =
      typeof urlOrRequest === "string" ? urlOrRequest : urlOrRequest?.url;

    let content = await implementation.fetchContent(url);

    if (content) {
      const parsed = JSON.parse(content);
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

    const contents = {
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
      // @ts-expect-error: TODO
      contents.response.bodyJson = JSON.parse(bodyText);
    // @ts-expect-error: TODO
    else contents.response.bodyText = bodyText;

    await implementation.storeContent(url, contents);

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
