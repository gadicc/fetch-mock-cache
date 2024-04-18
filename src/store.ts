import type { JFMCCacheContent } from "./cache";

const localCrypto =
  typeof crypto === "undefined" ? require("node:crypto").webcrypto : crypto;

export default class JFMCStore {
  static async hash(input: string) {
    const utf8 = new TextEncoder().encode(input);
    const hashBuffer = await localCrypto.subtle.digest("SHA-256", utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((bytes) => bytes.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  }

  async hashFromHeaders(
    headers: Headers,
    len: number | null = null,
  ): Promise<string> {
    // No need to worry about set-cookie header/array in REQUEST headers.
    const jsonString = JSON.stringify(Object.fromEntries(headers.entries()));
    const hashHex = await JFMCStore.hash(jsonString);
    return len ? hashHex.substring(0, len) : hashHex;
  }

  async idFromResponse(request: Request): Promise<string> {
    return (
      request.url +
      "#" +
      JSON.stringify(Object.fromEntries(request.headers.entries()))
    );
  }

  async fetchContent(
    req: Request,
  ): Promise<JFMCCacheContent | null | undefined> {
    throw new Error("Not implemented");
  }

  async storeContent(req: Request, content: JFMCCacheContent): Promise<void> {
    throw new Error("Not implemented");
  }
}

export type { JFMCCacheContent };
