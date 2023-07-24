import JFMCStore from "../store";
import type { JFMCCacheContent } from "../store";

// TODO LRU cache

class JFMCMemoryStore extends JFMCStore {
  store: Map<string, JFMCCacheContent> = new Map();

  async fetchContent(req: Request): Promise<JFMCCacheContent | undefined> {
    const key = await this.idFromResponse(req);
    return this.store.get(key);
  }

  async storeContent(req: Request, content: JFMCCacheContent): Promise<void> {
    const key = await this.idFromResponse(req);
    this.store.set(key, content);
  }
}

export default JFMCMemoryStore;
