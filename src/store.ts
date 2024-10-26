/**
 * The "root" store class.  Unless you are implementing a new store, you
 * probably want to use one of the existing sub-classe, such as `fs` or
 * `memory`.
 *
 * @module
 */
import type { Runtime } from "./fetch-cache.js";
import type { FMCCacheContent } from "./cache.js";
import type { FetchCacheOptions } from "./fetch-cache.js";

/**
 * The "root" options for any store.  You can extend these with store-specific
 * options in sub-classes.  Note, the "required" `runtime` parameter is
 * automatically passed to the store by `createFetchCache`.
 */
export interface FMCStoreOptions {
  runtime: Runtime;
}

/**
 * The "root" store class.  Don't instantiate directly, either use an existing
 * sub-class (e.g. `fs` or `memory`) or extend this class to create a new store
 * class, overriding at least `fetchContent` and `storeContent`, and perhaps,
 * `idFromRequest`, the constructor and others according to your needs.
 *
 * @example
 * ```ts
 * import FMCStore from "fetch-mock-cache/store";
 * import type { FMCCacheContent, FMCStoreOptions } from "fetch-mock-cache/store";
 *
 * export default class MyStore extends FMCStore {
 *   async fetchContent(req: FMCCacheContent["request"]) {
 *     // your implementation here
 *   }
 *   async storeContent(content: FMCCacheContent) {
 *    // your implementation here
 *   }
 * }
 * ```
 */
export default class FMCStore {
  runtime: Runtime;
  // fetchCache?: FetchCache;

  constructor(options: FMCStoreOptions) {
    this.runtime = options.runtime;
  }

  /* **
   * Sets a ref back to fetchCache immediately after instantiation, so the
   * store can easily refer back to this.fetchCache in its methods.
   * @param fetchCache
   */ /*
  setFetchCache(fetchCache: FetchCache) {
    this.fetchCache = fetchCache;
  }
  */

  /**
   * Given an input string, return a SHA-256 hash of the string, truncated to
   * 7 characters, or to `length`, if specified.
   * @param input - the input string
   * @param length - truncated length of the hash, default: 7
   * @returns the hash, truncated to 7 characters, or to `length`, if specified.
   */
  async hash(input: string, length = 7): Promise<string> {
    return this.runtime.sha256(input, length);
  }

  /**
   * Given an FMCCacheContent.request object, return a Record<string,string>
   * of indentifiers that are unique to the request (e.g. method, headers, body).
   * This will later be used by `idFromRequest` to generate a single unique
   * identifier string.  For each new request, the store will check if a cached
   * copy with the id exists, in which case, it will be returned instead, rather
   * than performing an actual network request.
   * @param request an FMCCacheContent.request object
   * @param hashLen default hash length to use, default: 7
   * @returns a Record<string,string> of unique identifiers, or null if none
   */
  async uniqueRequestIdentifiers(
    request: FMCCacheContent["request"],
    hashLen = 7,
  ): Promise<Record<string, string> | null> {
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

  /**
   * Given an FMCCacheContent.request object, return a unique string id to
   * identify it.  Uses `uniqueRequestIdentifiers` under the hood.
   * @param request An FMCCacheContent.request object
   * @returns A unique string id
   */
  async idFromRequest(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<string> {
    if (options?.id) return options?.id;

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

  /**
   * Given an FMCCacheContent.request object, return the cached content
   * from the store if it exists, or undefined otherwise.
   * @param {FMCCacheContent["request"]} req
   * @returns {Promise<FMCCacheContent | undefined>}
   */
  async fetchContent(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: FMCCacheContent["request"],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: FetchCacheOptions,
  ): Promise<FMCCacheContent | null | undefined> {
    throw new Error("Not implemented");
  }

  /**
   * Given an FMCCacheContent object, store it in the store.
   * @param {FMCCacheContent} content
   */
  async storeContent(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    content: FMCCacheContent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: FetchCacheOptions,
  ): Promise<void> {
    throw new Error("Not implemented");
  }
}

export type { FMCCacheContent };
