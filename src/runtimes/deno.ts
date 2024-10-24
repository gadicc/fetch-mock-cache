/**
 * Entry point for using fetch-mock-cache with the Deno runtime.
 * @module
 */
import * as path from "jsr:@std/path@1";

import _createFetchCache, {
  CreateFetchCacheOptions,
  FetchCache,
  Runtime,
} from "../fetch-cache.js";

export const runtime: Runtime = {
  name: "node",
  env: Deno.env.toObject(),
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
    async readFile(path: string) {
      const data = await Deno.readFile(path);
      const decoder = new TextDecoder("utf-8");
      return decoder.decode(data);
    },
    async writeFile(path: string, content: string) {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      return Deno.writeFile(path, data);
    },
    mkdir: Deno.mkdir,
  },
  cwd: Deno.cwd,
  path: {
    join: path.join,
  },
};

/**
 * @example
 * ```ts
 * import createFetchCache from "fetch-mock-cache/runtimes/deno.ts"
 * import Store from "fetch-mock-cache/stores/memory";
 * const fetchCache = createFetchCache({ Store });
 */
export default function createFetchCache(
  options: Partial<CreateFetchCacheOptions> = {},
): FetchCache {
  return _createFetchCache({ ...options, runtime });
}
