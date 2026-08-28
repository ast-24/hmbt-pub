export type AdminMessengerSource =
  | "web"
  | "api"
  | "line-bot"
  | "batch"
  | "worker"
  | "other";

export type AdminMessengerLevel = "error" | "fatal";

export interface AdminMessengerRequestContext {
  method?: string;
  path?: string;
  route?: string;
  trace_id?: string;
  request_id?: string;
  user_id?: string;
}

export interface AdminMessengerErrorReport {
  source: AdminMessengerSource;
  service: string;
  level: AdminMessengerLevel;
  summary: string;
  message: string;
  timestamp_iso: string;
  status?: number;
  code?: string;
  stack?: string;
  environment?: string;
  request?: AdminMessengerRequestContext;
  context?: Record<string, unknown>;
}
