import JFMCStore from "../store";
import type { JFMCCacheContent } from "../store";

// TODO LRU cache

class JFMCMemoryStore extends JFMCStore {
  store: Map<string, JFMCCacheContent> = new Map();

  async fetchContent(
    req: JFMCCacheContent["request"],
  ): Promise<JFMCCacheContent | undefined> {
    const key = await this.idFromRequest(req);
    return this.store.get(key);
  }

  async storeContent(content: JFMCCacheContent): Promise<void> {
    const key = await this.idFromRequest(content.request);
    this.store.set(key, content);
  }
}

export default JFMCMemoryStore;
