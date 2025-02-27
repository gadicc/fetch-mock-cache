/**
 * Entry point for using fetch-mock-cache with the Deno runtime.
 * @module
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: for typescript parsing outside of deno
import * as path from "@std/path";

import _createFetchCache, {
  CreateFetchCacheOptions,
  FetchCache,
  Runtime,
} from "../fetch-cache.js";

export const runtime: Runtime = {
  name: "node",
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore: for typescript parsing outside of deno
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
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore: for typescript parsing outside of deno
      const data = await Deno.readFile(path);
      const decoder = new TextDecoder("utf-8");
      return decoder.decode(data);
    },
    async writeFile(path: string, content: string) {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore: for typescript parsing outside of deno
      return Deno.writeFile(path, data);
    },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: for typescript parsing outside of deno
    mkdir: Deno.mkdir,
  },
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore: for typescript parsing outside of deno
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
