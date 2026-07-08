/**
 * File system store.  Cached content will be written to the file system and
 * can potentially be committed to your project's repository / source control,
 * as fits your needs.  The store is runtime agnostic, as the relevant file
 * system operations are abstracted by the using the correct runtime entry
 * point.
 * @module
 */
import filenamifyUrl from "filenamify-url";
import type { FetchCacheOptions } from "../fetch-cache.js";
import type { FMCCacheContent, FMCStoreOptions } from "../store.js";
import FMCStore from "../store.js";

/**
 * Options for the file-system store.
 */
export interface FMCFileStoreOptions extends FMCStoreOptions {
  /** Directory where fixture files are read and written. */
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
  /** Shared directory creation promise used to avoid duplicate mkdir calls. */
  _mkdirPromise?: Promise<unknown>;
  /** Current working directory captured from the runtime adapter. */
  _cwd: string;
  /** Absolute directory where fixture files are stored. */
  _location: string;

  /**
   * Creates a file-system store rooted at `options.location`, or at
   * `tests/fixtures/http` when no location is provided.
   */
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

  /**
   * Returns an absolute fixture path inside the store directory, creating the
   * directory first when needed.
   */
  async cache_dir(filename: string): Promise<string> {
    if (!this._mkdirPromise) {
      this._mkdirPromise = this.runtime.fs.mkdir(this._location, {
        recursive: true,
      });
    }
    await this._mkdirPromise;
    return this.runtime.path.join(this._location, filename);
  }

  /**
   * Returns a file-safe cache id for the request, including the `.json`
   * extension used by this store.
   */
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

  /**
   * Returns the absolute fixture file path for a request.
   */
  async pathFromRequest(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<string> {
    return await this.cache_dir(await this.idFromRequest(request, options));
  }

  /**
   * Reads and parses cached content from the request's fixture file.
   */
  override async fetchContent(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<FMCCacheContent | null> {
    const path = await this.pathFromRequest(request, options);
    let content: string;
    try {
      content = await this.runtime.fs.readFile(path);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    try {
      return JSON.parse(content) as FMCCacheContent;
    } catch (error) {
      throw new Error(
        `fetch-mock-cache: cache file exists but is not valid JSON: ${path} (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
  }

  /**
   * Writes cached content as formatted JSON to the request's fixture file.
   */
  override async storeContent(
    content: FMCCacheContent,
    options?: FetchCacheOptions,
  ): Promise<void> {
    const path = await this.pathFromRequest(content.request, options);
    await this.runtime.fs.writeFile(path, JSON.stringify(content, null, 2));
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("code" in error && error.code === "ENOENT") || // node, bun
      ("name" in error && error.name === "NotFound")) // deno
  );
}
