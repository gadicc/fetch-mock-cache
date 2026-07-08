/**
 * Default Node.js entry point for creating a cached `fetch`
 * implementation.
 *
 * This module exports the Node runtime adapter and re-exports the shared
 * cache option types used by all runtime adapters.
 *
 * @module
 */

import createCachingFetch from "./runtimes/node.js";

export * from "./runtimes/node.js";

/**
 * Creates a cached `fetch` implementation configured with the Node.js
 * runtime adapter.
 */
export default createCachingFetch;
