/**
 * Entry point for using fetch-mock-cache with the Bun runtime.
 * @module
 */

import _createFetchCache, {
  type CreateFetchCacheOptions,
  type FetchCache,
} from "../fetch-cache.js";

export type {
  CreateFetchCacheOptions,
  FetchCache,
  FetchCacheMode,
  FetchCacheOptions,
  ReadCacheOption,
  Runtime,
  WriteCacheOption,
} from "../fetch-cache.js";

// For now, bun is just so awesomely compatible out of the box that there's
// nothing to do.  But, consider bun-optimized calls in the future, if needed.
import { runtime } from "./node.js";

/**
 * Creates a cached `fetch` implementation using the Bun runtime adapter.
 *
 * @example
 * ```ts
 * import createFetchCache from "fetch-mock-cache/runtimes/bun.js"
 * import Store from "fetch-mock-cache/stores/memory";
 * const fetchCache = createFetchCache({ Store });
 * ```
 */
export default function createFetchCache(
  options: Partial<CreateFetchCacheOptions> = {},
): FetchCache {
  return _createFetchCache({ ...options, runtime });
}
