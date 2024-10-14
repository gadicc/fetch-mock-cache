import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import fs from "node:fs";
import _createCachingMock, {
  CreateFetchCacheOptions,
  Runtime,
} from "../fetch-cache.js";

export const runtime: Runtime = {
  name: "node",
  env: { ...process.env },
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

export default function createCachingMock(
  options: Partial<CreateFetchCacheOptions> = {},
) {
  return _createCachingMock({ ...options, runtime });
}
