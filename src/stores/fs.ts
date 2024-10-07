// NB: this is just the generalized filesystem store components, it won't work
// on it's own.  You need to extend it and implement `readFile` and `writeFile`
// methods.
import filenamify from "filenamify";
import fs from "fs/promises";
import path from "path";

import FMCStore from "../store";
import type { FMCCacheContent, FMCStoreOptions } from "../store";
import filenamifyUrl from "filenamify-url";

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
      await fs.mkdir(this._location, { recursive: true });
    }
    return path.join(this._location, filename);
  }

  async idFromRequest(request: FMCCacheContent["request"]): Promise<string> {
    const id = await super.idFromRequest(request);
    const parts = id.match(/^(.*?)(\[.*\])?$/);
    if (!parts) throw new Error("Invalid id");
    return filenamifyUrl(parts[1]) + (parts[2] || "") + ".json";
  }

  async pathFromRequest(request: FMCCacheContent["request"]): Promise<string> {
    return await this.cache_dir(await this.idFromRequest(request));
  }

  async fetchContent(request: FMCCacheContent["request"]) {
    const path = await this.pathFromRequest(request);
    try {
      const content = await fs.readFile(path, "utf8");
      return JSON.parse(content) as FMCCacheContent;
    } catch (error) {
      return null;
    }
  }

  async storeContent(content: FMCCacheContent) {
    const path = await this.pathFromRequest(content.request);
    await fs.writeFile(path, JSON.stringify(content, null, 2));
  }

  async readFile(path: string) {
    throw new Error(
      "Please overide the `readFile` method or use an fs subclass store",
    );
  }

  async writeFile(path: string, content: string) {
    throw new Error(
      "Please overide the `writeFile` method or use an fs subclass store",
    );
  }
}

export default FMCFileSystemStore;
