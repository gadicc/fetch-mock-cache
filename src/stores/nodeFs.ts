import filenamifyUrl from "filenamify-url";
import fs from "fs/promises";

import type { JFMCStore, JFMCCacheContent } from "../store";

const CWD = process.cwd();
function cache_dir(filename: string) {
  return `${CWD}/tests/fixtures/http/${filename}`;
}
(async () => {
  await fs.mkdir(cache_dir(""), { recursive: true });
})();

export default class JFMCNodeFSStore implements JFMCStore {
  async fetchContent(req: Request) {
    const url = req.url;
    const path = cache_dir(filenamifyUrl(url));
    try {
      const content = await fs.readFile(path, "utf8");
      return JSON.parse(content) as JFMCCacheContent;
    } catch (error) {
      return null;
    }
  }

  async storeContent(req: Request, content: JFMCCacheContent) {
    const url = req.url;
    const path = cache_dir(filenamifyUrl(url));
    await fs.writeFile(path, JSON.stringify(content, null, 2));
  }
}
