import type { Runtime } from "./fetch-mock.js";
import type { FMCCacheContent } from "./cache.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FMCStoreOptions {
  runtime: Runtime;
}

export default class FMCStore {
  runtime: Runtime;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(options: FMCStoreOptions) {
    this.runtime = options.runtime;
  }

  async hash(input: string, length = 7): Promise<string> {
    return this.runtime.sha256(input, length);
  }

  async uniqueRequestIdentifiers(
    request: FMCCacheContent["request"],
    hashLen = 7,
  ) {
    const ids: Record<string, string> = {};

    if (request.method && request.method !== "GET") {
      ids.method = request.method;
    }
    if (request.headers) {
      ids.headers = await this.hash(JSON.stringify(request.headers), hashLen);
    }
    if (request.bodyJson) {
      const body = JSON.stringify(request.bodyJson);
      ids.body = await this.hash(body, hashLen);
    }
    if (request.bodyText) {
      const body = request.bodyText;
      ids.body = await this.hash(body, hashLen);
    }

    return Object.keys(ids).length > 0 ? ids : null;
  }

  async idFromRequest(request: FMCCacheContent["request"]): Promise<string> {
    let id = request.url;

    const ids = await this.uniqueRequestIdentifiers(request);
    if (ids)
      id +=
        "[" +
        Object.entries(ids)
          .map(([k, v]) => k + "=" + v)
          .join(",") +
        "]";

    return id;
  }

  async fetchContent(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: FMCCacheContent["request"],
  ): Promise<FMCCacheContent | null | undefined> {
    throw new Error("Not implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async storeContent(content: FMCCacheContent): Promise<void> {
    throw new Error("Not implemented");
  }
}

export type { FMCCacheContent };
