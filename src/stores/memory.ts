/**
 * In-memory store for cached content.  Can be useful for certain types of
 * testing, but your entire cache will be lost when the process exits.
 * As an alternative, consider the `fs` store, and to commit the genereated
 * files to your project's repository / source control.
 * @module
 */
import FMCStore from "../store.js";
import type { FMCCacheContent } from "../store.js";
import type { FetchCacheOptions } from "../fetch-cache.js";

// TODO LRU cache

/**
 * Used to instantiate a new file system store.
 * @param options (usually none)
 * @returns fs store instance, to pass to `createCachingMock`
 * @example
 * ```ts
 * import createFetchCache from "fetch-mock-cache"; // or /runtimes/deno.js etc
 * import Store from "fetch-mock-cache/stores/memory";
 * const fetchCache = createFetchCache({ Store });
 * ```
 */
export default class FMCMemoryStore extends FMCStore {
  store: Map<string, FMCCacheContent> = new Map();

  override async fetchContent(
    req: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<FMCCacheContent | undefined> {
    const key = await this.idFromRequest(req, options);
    return this.store.get(key);
  }

  override async storeContent(
    content: FMCCacheContent,
    options?: FetchCacheOptions,
  ): Promise<void> {
    const key = await this.idFromRequest(content.request, options);
    this.store.set(key, content);
  }
}
