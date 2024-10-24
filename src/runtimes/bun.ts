/**
 * Entry point for using fetch-mock-cache with the Bun runtime.
 * @module
 */

// For now, bun is just so awesomely compatible out of the box that there's
// nothing to do.  But, consider bun-optimized calls in the future, if needed.
import { runtime } from "./node.js";

import _createFetchCache, {
  CreateFetchCacheOptions,
  FetchCache,
} from "../fetch-cache.js";

/**
 * @example
 * ```ts
 * import createFetchCache from "fetch-mock-cache/runtimes/bun.js"
 * import Store from "fetch-mock-cache/stores/memory";
 * const fetchCache = createFetchCache({ Store });
 */
export default function createFetchCache(
  options: Partial<CreateFetchCacheOptions> = {},
): FetchCache {
  return _createFetchCache({ ...options, runtime });
}
