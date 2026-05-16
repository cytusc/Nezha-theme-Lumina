import { httpClient } from "./core/httpClient";
import { createLoggingInterceptor, createTimeoutInterceptor } from "./core/requestInterceptor";
import { createLoggingResponseInterceptor, createSuccessValidatorInterceptor } from "./core/responseHandler";
import { createErrorLoggingInterceptor } from "./core/errorHandler";

let initialized = false;

export function initializeApi(): void {
  if (initialized) return;

  httpClient.addRequestInterceptor(createLoggingInterceptor());
  httpClient.addRequestInterceptor(createTimeoutInterceptor(30_000));
  httpClient.addResponseInterceptor(createLoggingResponseInterceptor());
  httpClient.addResponseInterceptor(createSuccessValidatorInterceptor());
  httpClient.addErrorInterceptor(createErrorLoggingInterceptor());

  initialized = true;
}

if (typeof window !== "undefined") {
  initializeApi();
}
