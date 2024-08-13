import filenamify from "filenamify";
import fs from "fs/promises";
import path from "path";

import JFMCStore from "../store";
import type { JFMCCacheContent, JFMCStoreOptions } from "../store";
import filenamifyUrl from "filenamify-url";

interface JFMCNodeStoreOptions extends JFMCStoreOptions {
  location?: string;
}

const defaults = {
  location: path.join("tests", "fixtures", "http"),
};

class JFMCNodeFSStore extends JFMCStore {
  _createdCacheDir = false;
  _cwd = process.cwd();
  _location: string;

  constructor(options: JFMCNodeStoreOptions = {}) {
    super();
    this._location = path.join(
      this._cwd,
      options.location || defaults.location,
    );
  }

  // Cache in a sub-folder in the tests folder.
  async cache_dir(filename: string) {
    if (!this._createdCacheDir) {
      this._createdCacheDir = true;
      await fs.mkdir(this._location, { recursive: true });
    }
    return path.join(this._location, filename);
  }

  async idFromRequest(request: JFMCCacheContent["request"]): Promise<string> {
    const id = await super.idFromRequest(request);
    const parts = id.match(/^(.*?)(\[.*\])?$/);
    if (!parts) throw new Error("Invalid id");
    return filenamifyUrl(parts[1]) + (parts[2] || "") + ".json";
  }

  async pathFromRequest(request: JFMCCacheContent["request"]): Promise<string> {
    return await this.cache_dir(await this.idFromRequest(request));
  }

  async fetchContent(request: JFMCCacheContent["request"]) {
    const path = await this.pathFromRequest(request);
    try {
      const content = await fs.readFile(path, "utf8");
      return JSON.parse(content) as JFMCCacheContent;
    } catch (error) {
      return null;
    }
  }

  async storeContent(content: JFMCCacheContent) {
    const path = await this.pathFromRequest(content.request);
    await fs.writeFile(path, JSON.stringify(content, null, 2));
  }
}

export default JFMCNodeFSStore;
