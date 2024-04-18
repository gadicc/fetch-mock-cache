export interface JFMCCacheContent {
  request: {
    url: string;
    headers?: Record<string, string | string[]>;
  };
  response: {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string | string[]>;
    bodyJson?: string;
    bodyText?: string;
  };
}
