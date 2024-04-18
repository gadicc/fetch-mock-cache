import filenamifyUrl from "filenamify-url";
import fs from "fs/promises";
import path from "path";

import JFMCStore from "../store";
import type { JFMCCacheContent } from "../store";

class JFMCNodeFSStore extends JFMCStore {
  _createdCacheDir = false;
  _cwd = process.cwd();
  _location: string;

  constructor(location?: string) {
    super();
    this._location = location || "__cache__";
  }

  // Cache in a sub-folder in the tests folder.
  async cache_dir(filename: string) {
    if (!this._createdCacheDir) {
      this._createdCacheDir = true;
      await fs.mkdir(await this.cache_dir(""), { recursive: true });
    }
    return path.join(this._cwd, "tests", this._location, filename);
  }

  async idFromResponse(request: Request): Promise<string> {
    let filename = filenamifyUrl(request.url);
    if (Array.from(request.headers.keys()).length > 0) {
      const headersHash = await this.hashFromHeaders(request.headers, 7);
      filename += `[headers=${headersHash}]`;
    }
    return filename + ".json";
  }

  async fetchContent(request: Request) {
    const path = await this.cache_dir(await this.idFromResponse(request));
    try {
      const content = await fs.readFile(path, "utf8");
      return JSON.parse(content) as JFMCCacheContent;
    } catch (error) {
      return null;
    }
  }

  async storeContent(request: Request, content: JFMCCacheContent) {
    const path = await this.cache_dir(await this.idFromResponse(request));
    await fs.writeFile(path, JSON.stringify(content, null, 2));
  }
}

export default JFMCNodeFSStore;
