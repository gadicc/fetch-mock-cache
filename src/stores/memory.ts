import type { JFMCStore, JFMCCacheContent } from "../store";

// TODO LRU cache

export default class JFMCMemoryStore implements JFMCStore {
  private store: { [url: string]: JFMCCacheContent } = {};

  async fetchContent(url: string): Promise<JFMCCacheContent | undefined> {
    return this.store[url];
  }

  async storeContent(url: string, content: JFMCCacheContent): Promise<void> {
    this.store[url] = content;
  }
}
