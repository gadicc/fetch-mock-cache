import FMCStore from "../store.js";
import type { FMCCacheContent } from "../store.js";

// TODO LRU cache

class FMCMemoryStore extends FMCStore {
  store: Map<string, FMCCacheContent> = new Map();

  override async fetchContent(
    req: FMCCacheContent["request"],
  ): Promise<FMCCacheContent | undefined> {
    const key = await this.idFromRequest(req);
    return this.store.get(key);
  }

  override async storeContent(content: FMCCacheContent): Promise<void> {
    const key = await this.idFromRequest(content.request);
    this.store.set(key, content);
  }
}

export default FMCMemoryStore;
