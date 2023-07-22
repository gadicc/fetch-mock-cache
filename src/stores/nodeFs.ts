import filenamifyUrl from "filenamify-url";
import fs from "fs/promises";
import _debug from "debug";

import type { JFMCStore, JFMCCacheContent } from "../store";

const debug = _debug("jest-fetch-mock-cache:node");

const CWD = process.cwd();
function cache_dir(filename: string) {
  return `${CWD}/tests/fixtures/http/${filename}`;
}
(async () => {
  await fs.mkdir(cache_dir(""), { recursive: true });
})();

export default class JFMCNodeFSStore implements JFMCStore {
  async fetchContent(url: string) {
    const path = cache_dir(filenamifyUrl(url));
    try {
      const content = await fs.readFile(path, "utf8");
      debug("[jsmc] Using cached copy of %o", url);
      return JSON.parse(content) as JFMCCacheContent;
    } catch (error) {
      return null;
    }
  }

  async storeContent(url: string, content: JFMCCacheContent) {
    const path = cache_dir(filenamifyUrl(url));
    debug("[jsmc] Fetching and caching %o", url);
    await fs.writeFile(path, JSON.stringify(content, null, 2));
  }
}
