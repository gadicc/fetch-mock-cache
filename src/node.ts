import filenamifyUrl from "filenamify-url";
import fs from "fs/promises";
import _debug from "debug";

import type { JFMCCacheContent } from "./index";

const debug = _debug("jest-fetch-mock-cache:node");

const CWD = process.cwd();
function cache_dir(filename: string) {
  return `${CWD}/tests/fixtures/http/${filename}`;
}
(async () => {
  await fs.mkdir(cache_dir(""), { recursive: true });
})();

async function fetchContent(url: string) {
  const path = cache_dir(filenamifyUrl(url));
  try {
    const content = await fs.readFile(path, "utf8");
    debug("[jsmc] Using cached copy of %o", url);
    return content;
  } catch (error) {
    return null;
  }
}

async function storeContent(url: string, content: JFMCCacheContent) {
  const path = cache_dir(filenamifyUrl(url));
  debug("[jsmc] Fetching and caching %o", url);
  await fs.writeFile(path, JSON.stringify(content, null, 2));
}

export { fetchContent, storeContent };
