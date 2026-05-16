import type { ApiResponse, RequestLogEntry } from "../types";
import { apiLogger } from "../monitoring/apiLogger";
import { apiMonitor } from "../monitoring/apiMonitor";

export function createLoggingResponseInterceptor(): (
  response: ApiResponse,
) => ApiResponse | Promise<ApiResponse> {
  return (response: ApiResponse): ApiResponse => {
    const logEntry = (response as unknown as Record<string, unknown>).__logEntry as
      | RequestLogEntry
      | undefined;

    if (logEntry) {
      logEntry.status = response.status;
      logEntry.duration = response.duration;
    }

    apiLogger.debug("API Response", {
      requestId: logEntry?.id,
      path: logEntry?.path,
      status: response.status,
      duration: Math.round(response.duration),
      success: response.success,
    });

    apiMonitor.recordRequest({
      ...(logEntry ?? { id: "", timestamp: Date.now(), path: "", method: "GET" }),
      status: response.status,
      duration: response.duration,
      success: response.success,
    });

    return response;
  };
}

export function createSuccessValidatorInterceptor(): (
  response: ApiResponse,
) => ApiResponse | Promise<ApiResponse> {
  return <T,>(response: ApiResponse<T>): ApiResponse<T> => {
    if (!response.success && response.status >= 400) {
      const errorData = response.data as Record<string, unknown>;
      throw {
        message:
          (errorData?.message as string) ??
          (errorData?.error as string) ??
          `Request failed with status ${response.status}`,
        code: `HTTP_${response.status}`,
        status: response.status,
        path: "",
        timestamp: Date.now(),
        details: errorData,
      };
    }

    return response;
  };
}
