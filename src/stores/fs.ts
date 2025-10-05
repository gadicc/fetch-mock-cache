/**
 * File system store.  Cached content will be written to the file system and
 * can potentially be committed to your project's repository / source control,
 * as fits your needs.  The store is runtime agnostic, as the relevant file
 * system operations are abstracted by the using the correct runtime entry
 * point.
 * @module
 */
import filenamifyUrl from "filenamify-url";
import { FetchCacheOptions } from "../fetch-cache.js";
import type { FMCCacheContent, FMCStoreOptions } from "../store.js";
import FMCStore from "../store.js";

interface FMCFileStoreOptions extends FMCStoreOptions {
  location?: string;
}

/**
 * Used to instantiate a new file system store.
 * @param options e.g. { location: "./tests/fixtures/http" }
 * @returns fs store instance, to pass to `createCachingMock`
 * @example
 * ```ts
 * import createFetchCache from "fetch-mock-cache"; // or /runtimes/deno.js etc
 * import Store from "fetch-mock-cache/stores/fs";
 * const fetchCache = createFetchCache({ Store });
 * ```
 */
export default class FMCFileSystemStore extends FMCStore {
  _createdCacheDir = false;
  _cwd: string;
  _location: string;

  constructor(options: FMCFileStoreOptions) {
    super(options);

    const defaults = {
      location: this.runtime.path.join("tests", "fixtures", "http"),
    };

    this._cwd = this.runtime.cwd();
    this._location = this.runtime.path.join(
      this._cwd,
      options.location || defaults.location,
    );
  }

  // Cache in a sub-folder in the tests folder.
  async cache_dir(filename: string): Promise<string> {
    if (!this._createdCacheDir) {
      this._createdCacheDir = true;
      await this.runtime.fs.mkdir(this._location, { recursive: true });
    }
    return this.runtime.path.join(this._location, filename);
  }

  override async idFromRequest(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<string> {
    if (options?.id) return options?.id + ".json";
    const id = await super.idFromRequest(request);
    const parts = id.match(/^(.*?)(\[.*\])?$/);
    if (!parts) throw new Error("Invalid id");
    return filenamifyUrl(parts[1]) + (parts[2] || "") + ".json";
  }

  async pathFromRequest(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<string> {
    return await this.cache_dir(await this.idFromRequest(request, options));
  }

  override async fetchContent(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<FMCCacheContent | null> {
    const path = await this.pathFromRequest(request, options);
    try {
      const content = await this.runtime.fs.readFile(path);
      return JSON.parse(content) as FMCCacheContent;
    } catch (_error) {
      return null;
    }
  }

  override async storeContent(
    content: FMCCacheContent,
    options?: FetchCacheOptions,
  ): Promise<void> {
    const path = await this.pathFromRequest(content.request, options);
    await this.runtime.fs.writeFile(path, JSON.stringify(content, null, 2));
  }
}
