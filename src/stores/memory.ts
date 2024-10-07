import FMCStore from "../store";
import type { FMCCacheContent } from "../store";

// TODO LRU cache

class FMCMemoryStore extends FMCStore {
  store: Map<string, FMCCacheContent> = new Map();

  async fetchContent(
    req: FMCCacheContent["request"],
  ): Promise<FMCCacheContent | undefined> {
    const key = await this.idFromRequest(req);
    return this.store.get(key);
  }

  async storeContent(content: FMCCacheContent): Promise<void> {
    const key = await this.idFromRequest(content.request);
    this.store.set(key, content);
  }
}

export default FMCMemoryStore;
