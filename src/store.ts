import type { JFMCCacheContent } from "./index";

export interface JFMCStore {
  fetchContent(url: string): Promise<JFMCCacheContent | null | undefined>;
  storeContent(url: string, content: JFMCCacheContent): Promise<void>;
}

export type { JFMCCacheContent };
