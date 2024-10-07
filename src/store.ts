import type { FMCCacheContent } from "./cache";

export interface FMCStoreOptions {}

const localCrypto =
  typeof crypto === "undefined" ? require("node:crypto").webcrypto : crypto;

export default class FMCStore {
  static async hash(input: string, length?: number) {
    const utf8 = new TextEncoder().encode(input);
    const hashBuffer = await localCrypto.subtle.digest("SHA-256", utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((bytes) => bytes.toString(16).padStart(2, "0"))
      .join("");
    return length ? hashHex.substring(0, length) : hashHex;
  }

  static async uniqueRequestIdentifiers(
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

  constructor(options: FMCStoreOptions = {}) {}

  async idFromRequest(request: FMCCacheContent["request"]): Promise<string> {
    let id = request.url;

    const ids = await FMCStore.uniqueRequestIdentifiers(request);
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
    request: FMCCacheContent["request"],
  ): Promise<FMCCacheContent | null | undefined> {
    throw new Error("Not implemented");
  }

  async storeContent(content: FMCCacheContent): Promise<void> {
    throw new Error("Not implemented");
  }
}

export type { FMCCacheContent };
