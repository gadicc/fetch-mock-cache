export interface FMCCacheContent {
  request: {
    url: string;
    headers?: Record<string, string | string[]>;
    method?: RequestInit["method"];
    bodyJson?: Record<string, unknown>;
    bodyText?: string;
  };
  response: {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string | string[]>;
    bodyJson?: Record<string, unknown>;
    bodyText?: string;
  };
}
