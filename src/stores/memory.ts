/**
 * In-memory store for cached content.  Can be useful for certain types of
 * testing, but your entire cache will be lost when the process exits.
 * As an alternative, consider the `fs` store, and commit the generated
 * files to your project's repository / source control.
 * @module
 */

import type { FetchCacheOptions } from "../fetch-cache.js";
import type { FMCCacheContent } from "../store.js";
import FMCStore from "../store.js";

// TODO LRU cache

/**
 * Used to instantiate a new in-memory store.
 *
 * @param options (usually none)
 * @returns memory store instance, to pass to `createCachingMock`
 * @example
 * ```ts
 * import createFetchCache from "fetch-mock-cache"; // or /runtimes/deno.js etc
 * import Store from "fetch-mock-cache/stores/memory";
 * const fetchCache = createFetchCache({ Store });
 * ```
 */
export default class FMCMemoryStore extends FMCStore {
  /** Cache entries keyed by the store-generated request id. */
  store: Map<string, FMCCacheContent> = new Map();

  /**
   * Returns cached content for the request, or `undefined` on a cache miss.
   */
  override async fetchContent(
    req: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<FMCCacheContent | undefined> {
    const key = await this.idFromRequest(req, options);
    return this.store.get(key);
  }

  /**
   * Stores content in memory under the request's generated cache id.
   */
  override async storeContent(
    content: FMCCacheContent,
    options?: FetchCacheOptions,
  ): Promise<void> {
    const key = await this.idFromRequest(content.request, options);
    this.store.set(key, content);
  }
}
