import path from "path";
import filenamifyUrl from "filenamify-url";

import FMCStore from "../store.js";
import type { FMCCacheContent, FMCStoreOptions } from "../store.js";

interface FMCFileStoreOptions extends FMCStoreOptions {
  location?: string;
}

const defaults = {
  location: path.join("tests", "fixtures", "http"),
};

class FMCFileSystemStore extends FMCStore {
  _createdCacheDir = false;
  _cwd = process.cwd();
  _location: string;

  constructor(options: FMCFileStoreOptions = {}) {
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
      await this.runtime().fs.mkdir(this._location, { recursive: true });
    }
    return path.join(this._location, filename);
  }

  override async idFromRequest(
    request: FMCCacheContent["request"],
  ): Promise<string> {
    const id = await super.idFromRequest(request);
    const parts = id.match(/^(.*?)(\[.*\])?$/);
    if (!parts) throw new Error("Invalid id");
    return filenamifyUrl(parts[1]) + (parts[2] || "") + ".json";
  }

  async pathFromRequest(request: FMCCacheContent["request"]): Promise<string> {
    return await this.cache_dir(await this.idFromRequest(request));
  }

  override async fetchContent(request: FMCCacheContent["request"]) {
    const path = await this.pathFromRequest(request);
    try {
      const content = await this.runtime().fs.readFile(path);
      return JSON.parse(content) as FMCCacheContent;
    } catch (_error) {
      return null;
    }
  }

  override async storeContent(content: FMCCacheContent) {
    const path = await this.pathFromRequest(content.request);
    await this.runtime().fs.writeFile(path, JSON.stringify(content, null, 2));
  }
}

export default FMCFileSystemStore;
