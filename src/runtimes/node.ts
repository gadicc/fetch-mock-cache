import process from "node:process";
import crypto from "node:crypto";
import fs from "node:fs";
import _createCachingMock, {
  CreateCachingMockOptions,
  Runtime,
} from "../fetch-mock.js";

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
};

export default function createCachingMock(
  options: Partial<CreateCachingMockOptions> = {},
) {
  return _createCachingMock({ ...options, runtime });
}
