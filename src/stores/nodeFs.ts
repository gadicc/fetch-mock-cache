import filenamifyUrl from "filenamify-url";
import fs from "fs/promises";

import JFMCStore from "../store";
import type { JFMCCacheContent } from "../store";

const CWD = process.cwd();
function cache_dir(filename: string) {
  return `${CWD}/tests/fixtures/http/${filename}`;
}
(async () => {
  await fs.mkdir(cache_dir(""), { recursive: true });
})();

class JFMCNodeFSStore extends JFMCStore {
  async idFromResponse(request: Request): Promise<string> {
    let filename = filenamifyUrl(request.url);
    if (Array.from(request.headers.keys()).length > 0) {
      const headersHash = await this.hashFromHeaders(request.headers, 7);
      filename += `[headers:${headersHash}]`;
    }
    return filename;
  }

  async fetchContent(request: Request) {
    const path = cache_dir(await this.idFromResponse(request));
    try {
      const content = await fs.readFile(path, "utf8");
      return JSON.parse(content) as JFMCCacheContent;
    } catch (error) {
      return null;
    }
  }

  async storeContent(request: Request, content: JFMCCacheContent) {
    const path = cache_dir(await this.idFromResponse(request));
    await fs.writeFile(path, JSON.stringify(content, null, 2));
  }
}

export default JFMCNodeFSStore;
