import type {
  ApiError,
  ApiRequestConfig,
  ApiResponse,
} from "../types";

const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private requestInterceptors: Array<
    (config: ApiRequestConfig) => ApiRequestConfig | Promise<ApiRequestConfig>
  >;
  private responseInterceptors: Array<
    (response: ApiResponse) => ApiResponse | Promise<ApiResponse>
  >;
  private errorInterceptors: Array<
    (error: ApiError) => ApiError | Promise<ApiError>
  >;

  constructor(options?: { baseUrl?: string; defaultHeaders?: Record<string, string> }) {
    this.baseUrl = options?.baseUrl ?? "";
    this.defaultHeaders = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options?.defaultHeaders,
    };
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.errorInterceptors = [];
  }

  addRequestInterceptor(
    interceptor: (config: ApiRequestConfig) => ApiRequestConfig | Promise<ApiRequestConfig>,
  ): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index > -1) this.requestInterceptors.splice(index, 1);
    };
  }

  addResponseInterceptor(
    interceptor: (response: ApiResponse) => ApiResponse | Promise<ApiResponse>,
  ): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index > -1) this.responseInterceptors.splice(index, 1);
    };
  }

  addErrorInterceptor(
    interceptor: (error: ApiError) => ApiError | Promise<ApiError>,
  ): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index > -1) this.errorInterceptors.splice(index, 1);
    };
  }

  async request<T = unknown>(config: ApiRequestConfig): Promise<ApiResponse<T>> {
    const startTime = performance.now();
    let processedConfig = { ...config };

    try {
      for (const interceptor of this.requestInterceptors) {
        processedConfig = await interceptor(processedConfig);
      }

      const url = this.buildUrl(processedConfig);
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        processedConfig.timeout ?? DEFAULT_TIMEOUT_MS,
      );

      if (processedConfig.signal) {
        processedConfig.signal.addEventListener("abort", () => controller.abort());
      }

      const response = await fetch(url, {
        method: processedConfig.method ?? "GET",
        headers: { ...this.defaultHeaders, ...processedConfig.headers },
        body: processedConfig.body ? JSON.stringify(processedConfig.body) : undefined,
        credentials: processedConfig.credentials ?? "include",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = performance.now() - startTime;
      const data = await this.parseResponse<T>(response);

      let apiResponse: ApiResponse<T> = {
        success: response.ok,
        data,
        status: response.status,
        headers: response.headers,
        duration,
      };

      for (const interceptor of this.responseInterceptors) {
        apiResponse = (await interceptor(apiResponse as ApiResponse<unknown>)) as ApiResponse<T>;
      }

      return apiResponse;
    } catch (error) {
      const duration = performance.now() - startTime;
      let apiError: ApiError = this.normalizeError(error, config.path, duration);

      for (const interceptor of this.errorInterceptors) {
        apiError = await interceptor(apiError);
      }

      throw apiError;
    }
  }

  async get<T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean>,
    options?: Partial<ApiRequestConfig>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      path,
      method: "GET",
      params,
      ...options,
    });
  }

  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: Partial<ApiRequestConfig>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      path,
      method: "POST",
      body,
      ...options,
    });
  }

  private buildUrl(config: ApiRequestConfig): string {
    let url = `${this.baseUrl}${config.path}`;

    if (config.params && Object.keys(config.params).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(config.params)) {
        searchParams.set(key, String(value));
      }
      url += `?${searchParams.toString()}`;
    }

    return url;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    if (contentType.includes("text/")) {
      return (await response.text()) as unknown as T;
    }

    return (await response.blob()) as unknown as T;
  }

  private normalizeError(error: unknown, path: string, duration: number): ApiError {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        message: "请求已取消",
        code: "ABORTED",
        status: 0,
        path,
        timestamp: Date.now(),
        details: { duration },
      };
    }

    if (error instanceof Error) {
      if (error.message.includes("fetch")) {
        return {
          message: "网络连接失败，请检查网络设置",
          code: "NETWORK_ERROR",
          status: 0,
          path,
          timestamp: Date.now(),
          details: { originalMessage: error.message, duration },
        };
      }

      return {
        message: error.message,
        code: "REQUEST_ERROR",
        status: 0,
        path,
        timestamp: Date.now(),
        details: { duration },
      };
    }

    return {
      message: "未知错误",
      code: "UNKNOWN_ERROR",
      status: 0,
      path,
      timestamp: Date.now(),
      details: { error, duration },
    };
  }
}

export const httpClient = new HttpClient();
