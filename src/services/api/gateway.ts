import { httpClient } from "./core/httpClient";
import { wsManager } from "./core/wsManager";
import { createLoggingInterceptor, createTimeoutInterceptor } from "./core/requestInterceptor";
import { createLoggingResponseInterceptor, createSuccessValidatorInterceptor } from "./core/responseHandler";
import { createErrorLoggingInterceptor } from "./core/errorHandler";
import { apiLogger } from "./monitoring/apiLogger";
import { nezhaAdapter } from "./adapters/nezhaAdapter";
import { z } from "zod";
import type {
  HomeBootstrapPayload,
  LoadRecordsResponse,
  Me,
  NodeDisplay,
  PingOverviewItem,
  PingRecordsResponse,
  Version,
} from "@/types/monitor";

type WebSocketMessageHandler = (data: unknown) => void;
type WebSocketErrorHandler = (error: Event) => void;
type WebSocketCloseHandler = (code: number, reason: string) => void;

class ApiGateway {
  private initialized: boolean = false;

  initialize(): void {
    if (this.initialized) return;

    // Register interceptors
    httpClient.addRequestInterceptor(createLoggingInterceptor());
    httpClient.addRequestInterceptor(createTimeoutInterceptor(30_000));
    httpClient.addResponseInterceptor(createLoggingResponseInterceptor());
    httpClient.addResponseInterceptor(createSuccessValidatorInterceptor());
    httpClient.addErrorInterceptor(createErrorLoggingInterceptor());

    this.initialized = true;
    apiLogger.info("API Gateway initialized", {
      timestamp: Date.now(),
      version: "2.0.0",
      features: [
        "request-logging",
        "response-validation",
        "error-handling",
        "monitoring",
      ],
    });
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ========== Server & Node APIs ==========

  async getHomeBootstrap(): Promise<HomeBootstrapPayload> {
    return await nezhaAdapter.getHomeBootstrap();
  }

  getServerStreamUrl(): string {
    return nezhaAdapter.getServerStreamUrl();
  }

  // ========== WebSocket Management APIs ==========

  wsConnect(url?: string): void {
    const connectUrl = url || this.getServerStreamUrl();
    apiLogger.info("WebSocket connecting via gateway", { url: connectUrl });
    wsManager.connect(connectUrl);
  }

  wsDisconnect(code: number = 1000, reason: string = ""): void {
    apiLogger.info("WebSocket disconnecting via gateway", { code, reason });
    wsManager.disconnect(code, reason);
  }

  wsSend(data: unknown): void {
    wsManager.send(data);
  }

  wsOnMessage(handler: WebSocketMessageHandler): () => void {
    return wsManager.onMessage(handler);
  }

  wsOnError(handler: WebSocketErrorHandler): () => void {
    return wsManager.onError(handler);
  }

  wsOnClose(handler: WebSocketCloseHandler): () => void {
    return wsManager.onClose(handler);
  }

  wsGetStatus() {
    return wsManager.getStatus();
  }

  wsDestroy(): void {
    wsManager.destroy();
  }

  parseServerStreamPayload(payload: unknown) {
    return nezhaAdapter.parseServerStreamPayload(payload);
  }

  mapStreamServerToNodeDisplay(
    server: Parameters<typeof nezhaAdapter.mapStreamServerToNodeDisplay>[0],
    nowMs?: number,
  ): NodeDisplay {
    return nezhaAdapter.mapStreamServerToNodeDisplay(server, nowMs);
  }

  rememberNodeDisplay(node: NodeDisplay): void {
    return nezhaAdapter.rememberNodeDisplay(node);
  }

  // ========== Metrics & Records APIs ==========

  async getLoadRecords(uuid: string, hours?: number): Promise<LoadRecordsResponse> {
    return await nezhaAdapter.getLoadRecords(uuid, hours);
  }

  async getPingRecords(uuid: string, hours?: number): Promise<PingRecordsResponse> {
    return await nezhaAdapter.getPingRecords(uuid, hours);
  }

  async getHomepagePingOverviewBatch(
    uuids: string[],
    options?: { signal?: AbortSignal },
  ): Promise<Record<string, PingOverviewItem>> {
    return await nezhaAdapter.getHomepagePingOverviewBatch(uuids, options);
  }

  async getPrimaryServiceOverview(uuid: string): Promise<PingOverviewItem> {
    return await nezhaAdapter.getPrimaryServiceOverview(uuid);
  }

  // ========== System APIs ==========

  async getMe(): Promise<Me> {
    return await nezhaAdapter.getMe();
  }

  async getVersion(): Promise<Version> {
    return await nezhaAdapter.getVersion();
  }

  // ========== Low-level Request API (for backward compatibility) ==========

  async request<TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    options?: { signal?: AbortSignal },
  ): Promise<z.output<TSchema>> {
    const response = await httpClient.get(path, undefined, options);
    const json = response.data as unknown;

    const ApiEnvelope = <T extends z.ZodTypeAny>(inner: T) =>
      z
        .object({
          success: z.boolean().default(true),
          data: inner.optional(),
          error: z.string().optional(),
        })
        .passthrough();

    const envelopeResult = ApiEnvelope(schema).safeParse(json);
    if (envelopeResult.success) {
      const envelope = envelopeResult.data;
      if (envelope.success === false) {
        throw new Error(envelope.error || `Request ${path} failed`);
      }
      if (envelope.data !== undefined) {
        return envelope.data as z.output<TSchema>;
      }
    }

    const rawResult = schema.safeParse(json);
    if (rawResult.success) return rawResult.data;

    throw new Error(
      `Schema mismatch on ${path}: ${
        envelopeResult.success ? "empty data" : envelopeResult.error.issues[0]?.message ?? "unknown"
      }`,
    );
  }

  // ========== Monitoring & Debug APIs ==========

  getApiMetrics() {
    const { apiMonitor } = require("./monitoring/apiMonitor");
    return apiMonitor.getMetrics();
  }

  getApiLogs(filter?: Parameters<typeof apiLogger.getLogs>[0]) {
    return apiLogger.getLogs(filter);
  }

  exportApiDiagnostics() {
    const { apiMonitor } = require("./monitoring/apiMonitor");
    return {
      metrics: apiMonitor.exportMetrics(),
      logs: apiLogger.exportLogs(),
      gatewayInitialized: this.initialized,
      exportTimestamp: Date.now(),
    };
  }
}

export const apiGateway = new ApiGateway();

// Auto-initialize in browser environment
if (typeof window !== "undefined") {
  apiGateway.initialize();
}
