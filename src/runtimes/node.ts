/**
 * Entry point for using fetch-mock-cache with the Node runtime.
 * @module
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import _createFetchCache, {
  type CreateFetchCacheOptions,
  type FetchCache,
  type Runtime,
} from "../fetch-cache.js";

export type {
  /** Options accepted by `createFetchCache`. */
  CreateFetchCacheOptions,
  /** Cached fetch function returned by `createFetchCache`. */
  FetchCache,
  /** Built-in cache behavior modes. */
  FetchCacheMode,
  /** Per-call or global options that control cache behavior. */
  FetchCacheOptions,
  /** Policy for deciding whether a cache lookup should run. */
  ReadCacheOption,
  /** Runtime adapter contract used by stores. */
  Runtime,
  /** Policy for deciding whether fetched content is stored. */
  WriteCacheOption,
} from "../fetch-cache.js";

/**
 * Runtime adapter that provides Node.js environment, hashing, filesystem,
 * path, and cwd operations to stores.
 */
export const runtime: Runtime = {
  name: "node",
  get env() {
    return process.env;
  },
  async sha256(input: string, length?: number) {
    const utf8 = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((bytes) => bytes.toString(16).padStart(2, "0"))
      .join("");
    return length ? hashHex.substring(0, length) : hashHex;
  },
  fs: {
    readFile: async (path: string) => fs.promises.readFile(path, "utf8"),
    writeFile: fs.promises.writeFile,
    mkdir: fs.promises.mkdir,
  },
  path: {
    join: path.join,
  },
  cwd: process.cwd,
};

/**
 * Creates a cached `fetch` implementation using the Node.js runtime adapter.
 *
 * @example
 * ```ts
 * import createFetchCache from "fetch-mock-cache/runtimes/node.js"
 * import Store from "fetch-mock-cache/stores/memory";
 * const fetchCache = createFetchCache({ Store });
 * ```
 */
export default function createFetchCache(
  options: Partial<CreateFetchCacheOptions> = {},
): FetchCache {
  return _createFetchCache({ ...options, runtime });
}
