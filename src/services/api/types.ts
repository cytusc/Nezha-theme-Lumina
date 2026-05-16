export interface ApiRequestConfig {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  body?: unknown;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  timeout?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  status: number;
  headers: Headers;
  duration: number;
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
  path: string;
  timestamp: number;
  details?: unknown;
}

export interface RequestLogEntry {
  id: string;
  timestamp: number;
  path: string;
  method: string;
  params?: Record<string, unknown>;
  status?: number;
  duration?: number;
  error?: string;
  cacheHit?: boolean;
}

export interface ApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  cacheHitRate: number;
  requestsByEndpoint: Record<string, EndpointMetrics>;
}

export interface EndpointMetrics {
  count: number;
  successCount: number;
  failCount: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  lastCalledAt: number;
  lastStatus: number;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  timestamp: number;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}
