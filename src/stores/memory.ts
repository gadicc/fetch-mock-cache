import type { JFMCStore, JFMCCacheContent } from "../store";

// TODO LRU cache

export default class JFMCMemoryStore implements JFMCStore {
  private store: { [url: string]: JFMCCacheContent } = {};

  async fetchContent(req: Request): Promise<JFMCCacheContent | undefined> {
    const url = req.url;
    return this.store[url];
  }

  async storeContent(req: Request, content: JFMCCacheContent): Promise<void> {
    const url = req.url;
    this.store[url] = content;
  }
}
