import type { ApiRequestConfig, RequestLogEntry } from "../types";
import { apiLogger } from "../monitoring/apiLogger";

let requestIdCounter = 0;

function generateRequestId(): string {
  requestIdCounter = (requestIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `req_${Date.now()}_${requestIdCounter}`;
}

export function createLoggingInterceptor(): (
  config: ApiRequestConfig,
) => ApiRequestConfig | Promise<ApiRequestConfig> {
  return (config: ApiRequestConfig): ApiRequestConfig => {
    const logEntry: RequestLogEntry = {
      id: generateRequestId(),
      timestamp: Date.now(),
      path: config.path,
      method: config.method ?? "GET",
      params: config.params,
    };

    (config as Record<string, unknown>).__logEntry = logEntry;

    apiLogger.debug("API Request", {
      requestId: logEntry.id,
      path: config.path,
      method: config.method ?? "GET",
      params: config.params,
    });

    return config;
  };
}

export function createAuthInterceptor(
  getToken?: () => string | null | undefined,
): (config: ApiRequestConfig) => ApiRequestConfig | Promise<ApiRequestConfig> {
  return (config: ApiRequestConfig): ApiRequestConfig => {
    if (!getToken) return config;

    const token = getToken();
    if (token) {
      return {
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        },
      };
    }

    return config;
  };
}

export function createTimeoutInterceptor(
  defaultTimeoutMs: number = 30_000,
): (config: ApiRequestConfig) => ApiRequestConfig | Promise<ApiRequestConfig> {
  return (config: ApiRequestConfig): ApiRequestConfig => {
    if (!config.timeout) {
      return {
        ...config,
        timeout: defaultTimeoutMs,
      };
    }
    return config;
  };
}
