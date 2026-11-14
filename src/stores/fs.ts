/**
 * File system store.  Cached content will be written to the file system and
 * can potentially be committed to your project's repository / source control,
 * as fits your needs.  The store is runtime agnostic, as the relevant file
 * system operations are abstracted by the using the correct runtime entry
 * point.
 * @module
 */

import createDebug from "debug";
import filenamifyUrl from "filenamify-url";
import type { FetchCacheOptions } from "../fetch-cache.js";
import type { FMCCacheContent, FMCStoreOptions } from "../store.js";
import FMCStore from "../store.js";

const debug = createDebug("fetch-mock-cache:fs");
const automaticDirectory = "fmc-v1";

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
  /** Shared creation promise for the versioned automatic-fixture directory. */
  #automaticDirectoryPromise?: Promise<unknown>;

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
   * Resolves a filename in the configured root, creating that directory when
   * needed. Use `pathFromRequest` to locate versioned automatic fixtures.
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
   * Returns a readable URL prefix and full SHA-256 request fingerprint, with
   * a `.json` extension. Explicit ids retain the `<id>.json` naming scheme.
   */
  override async idFromRequest(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<string> {
    if (options?.id) return options?.id + ".json";
    return `${filenamePrefix(request.url)}-${await this.#fingerprint(request)}.json`;
  }

  /** Hashes framed request metadata, preserving full hashes and binary bytes. */
  async #fingerprint(request: FMCCacheContent["request"]): Promise<string> {
    const ids = await this.uniqueRequestIdentifiers(request, 64);
    const entries = Object.entries(ids ?? {}).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return this.hash(
      JSON.stringify([
        "fetch-mock-cache/fs/v1",
        request.url,
        entries,
        this.uniqueRequestIdentifiers ===
          FMCStore.prototype.uniqueRequestIdentifiers &&
        ids?.body !== undefined &&
        "bodyBase64" in request
          ? request.bodyBase64
          : null,
      ]),
      64,
    );
  }

  /**
   * Returns the absolute fixture file path for a request.
   */
  async pathFromRequest(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<string> {
    const id = await this.idFromRequest(request, options);
    if (options?.id || !this.#usesBuiltinPaths()) return this.cache_dir(id);
    const directory = this.runtime.path.join(
      this._location,
      automaticDirectory,
    );
    this.#automaticDirectoryPromise ??= this.runtime.fs.mkdir(directory, {
      recursive: true,
    });
    await this.#automaticDirectoryPromise;
    return this.runtime.path.join(directory, id);
  }

  /** Whether the built-in naming and path contracts are still authoritative. */
  #usesBuiltinPaths(): boolean {
    return (
      this.idFromRequest === FMCFileSystemStore.prototype.idFromRequest &&
      this.pathFromRequest === FMCFileSystemStore.prototype.pathFromRequest &&
      this.cache_dir === FMCFileSystemStore.prototype.cache_dir
    );
  }

  /**
   * Reads the current fixture, or a legacy fixture whose stored request has
   * the same fingerprint. Reads never create or migrate fixture files.
   * Explicit ids bypass identity checking; custom id overrides skip fallback.
   */
  override async fetchContent(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<FMCCacheContent | null> {
    // Overrides (including bound methods/spies) own their path contracts.
    if (!this.#usesBuiltinPaths())
      return (
        (await this.#readContent(
          await this.pathFromRequest(request, options),
        )) ?? null
      );

    const id = await this.idFromRequest(request, options);
    const path = this.runtime.path.join(
      this._location,
      ...(options?.id ? [] : [automaticDirectory]),
      id,
    );
    const content = await this.#readContent(path);
    if (options?.id) return content ?? null;
    if (content !== undefined) {
      const matches = await this.#matchesRequest(content, id);
      if (!matches)
        debug("Rejected current fixture %o (stored request differs)", id);
      return matches ? content : null;
    }

    const legacyId = legacyFilename(
      await super.idFromRequest(request),
      this.runtime.path.join("a", "b").includes("\\"),
    );
    if (!legacyId) return null;
    const legacy = await this.#readContent(
      this.runtime.path.join(this._location, legacyId),
    );
    if (legacy === undefined) return null;
    const matches = await this.#matchesRequest(legacy, id);
    debug("%s legacy fixture %o", matches ? "Using" : "Rejected", legacyId);
    return matches ? legacy : null;
  }

  /** Verifies recorded identity without trusting hand-edited request metadata. */
  async #matchesRequest(
    content: FMCCacheContent,
    id: string,
  ): Promise<boolean> {
    if (!content?.request || typeof content.request.url !== "string")
      return false;
    try {
      return (await this.idFromRequest(content.request)) === id;
    } catch {
      return false;
    }
  }

  /** Reads one fixture, returning undefined only when its file is absent. */
  async #readContent(path: string): Promise<FMCCacheContent | undefined> {
    let content: string;
    try {
      content = await this.runtime.fs.readFile(path);
    } catch (error) {
      if (isNotFound(error)) return undefined;
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

function filenamePrefix(url: string): string {
  let prefix = url
    .replace(/^[a-z][a-z\d+.-]*:\/\//i, "")
    .replace(/[^a-zA-Z0-9._-]/g, "!")
    .replace(/^[.-]+/, "");
  // Windows reserves device names even when followed by a file extension.
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(prefix))
    prefix = `!${prefix}`;
  return prefix.slice(0, 60) || "request";
}

function legacyFilename(id: string, windows: boolean): string | undefined {
  try {
    const parts = id.match(/^(.*?)(\[.*\])?$/);
    if (!parts) return undefined;
    const filename = filenamifyUrl(parts[1]) + (parts[2] || "") + ".json";
    // Keep valid POSIX names, but never traverse a bracket suffix's separators
    // or attempt Windows device/path syntax on Windows.
    if (
      /[/\\\u0000]/.test(filename) ||
      (windows && /[<>:"|?*\u0001-\u001f]/.test(filename)) ||
      new TextEncoder().encode(filename).length > 255
    )
      return undefined;
    return filename;
  } catch {
    // Some valid fetch URLs cannot be decoded/normalized by filenamify-url.
    // They could not have been recorded with the old naming scheme.
    return undefined;
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
