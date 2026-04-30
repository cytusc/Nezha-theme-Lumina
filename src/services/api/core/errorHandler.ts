import type { ApiError } from "../types";
import { apiLogger } from "../monitoring/apiLogger";

export class ApiErrorHandler {
  private errorHandlers: Map<string, (error: ApiError) => void> = new Map();
  private globalErrorHandler?: (error: ApiError) => void;

  registerHandler(codePattern: string, handler: (error: ApiError) => void): () => void {
    this.errorHandlers.set(codePattern, handler);
    return () => this.errorHandlers.delete(codePattern);
  }

  setGlobalHandler(handler: (error: ApiError) => void): void {
    this.globalErrorHandler = handler;
  }

  handle(error: ApiError): never {
    apiLogger.error("API Error", {
      code: error.code,
      message: error.message,
      path: error.path,
      status: error.status,
      timestamp: error.timestamp,
    });

    for (const [pattern, handler] of this.errorHandlers) {
      if (this.matchPattern(error.code, pattern)) {
        handler(error);
        break;
      }
    }

    if (this.globalErrorHandler) {
      this.globalErrorHandler(error);
    }

    throw error;
  }

  private matchPattern(code: string, pattern: string): boolean {
    if (pattern === "*") return true;

    const regex = pattern
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");

    return new RegExp(`^${regex}$`).test(code);
  }
}

export const errorHandler = new ApiErrorHandler();

export function createErrorLoggingInterceptor(): (
  error: ApiError,
) => ApiError | Promise<ApiError> {
  return (error: ApiError): ApiError => {
    apiLogger.error("Request Failed", {
      code: error.code,
      message: error.message,
      path: error.path,
      status: error.status,
      duration: (error.details as Record<string, number>)?.duration,
    });

    return error;
  };
}

export function createRetryInterceptor(
  maxRetries: number = 1,
  retryableCodes: string[] = ["NETWORK_ERROR", "TIMEOUT"],
): (error: ApiError) => ApiError | Promise<ApiError> {
  return async (error: ApiError): Promise<ApiError> => {
    if (!retryableCodes.includes(error.code)) {
      return error;
    }

    const attempt = (error.details as Record<string, number>)?.__retryAttempt ?? 0;

    if (attempt >= maxRetries) {
      return error;
    }

    await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));

    return {
      ...error,
      details: {
        ...error.details,
        __retryAttempt: attempt + 1,
        __shouldRetry: true,
      },
    };
  };
}
