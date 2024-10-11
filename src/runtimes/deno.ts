import * as path from "jsr:@std/path";

import _createCachingMock, {
  CreateCachingMockOptions,
  Runtime,
} from "../fetch-mock.js";

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

export default function createCachingMock(
  options: Partial<CreateCachingMockOptions> = {},
) {
  return _createCachingMock({ ...options, runtime });
}
