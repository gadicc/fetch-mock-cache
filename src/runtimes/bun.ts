// For now, bun is just so awesomely compatible out of the box that there's
// nothing to do.  But, consider bun-optimized calls in the future, if needed.
import createCachingFetch from "./node.js";
export * from "./node.js";
export default createCachingFetch;
