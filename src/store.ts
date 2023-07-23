import type { JFMCCacheContent } from "./index";

export interface JFMCStore {
  fetchContent(req: Request): Promise<JFMCCacheContent | null | undefined>;
  storeContent(req: Request, content: JFMCCacheContent): Promise<void>;
}

export type { JFMCCacheContent };
