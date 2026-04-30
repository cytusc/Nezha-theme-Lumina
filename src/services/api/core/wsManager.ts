import { apiLogger } from "../monitoring/apiLogger";
import { apiMonitor } from "../monitoring/apiMonitor";

type WebSocketMessageHandler = (data: unknown) => void;
type WebSocketErrorHandler = (error: Event) => void;
type WebSocketCloseHandler = (code: number, reason: string) => void;

interface WebSocketConnectionOptions {
  url?: string;
  protocols?: string | string[];
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

class WebSocketManager {
  private socket: WebSocket | null = null;
  private messageHandlers: Set<WebSocketMessageHandler> = new Set();
  private errorHandlers: Set<WebSocketErrorHandler> = new Set();
  private closeHandlers: Set<WebSocketCloseHandler> = new Set();
  private reconnectTimer: number | null = null;
  private reconnectDelayMs: number;
  private maxReconnectDelayMs: number;
  private shouldReconnect: boolean;
  private connectionUrl: string;
  private connectionProtocols?: string | string[];
  private connectionStartTime: number = 0;
  private messageCount: number = 0;
  private lastMessageTime: number = 0;

  constructor(options: WebSocketConnectionOptions = {}) {
    this.connectionUrl = options.url || this.getDefaultUrl();
    this.connectionProtocols = options.protocols;
    this.shouldReconnect = options.reconnect ?? true;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 2000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30000;
  }

  private getDefaultUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/v1/ws/server`;
  }

  onMessage(handler: WebSocketMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onError(handler: WebSocketErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onClose(handler: WebSocketCloseHandler): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  getStatus(): {
    connected: boolean;
    readyState: number;
    messageCount: number;
    connectionDurationMs: number;
    lastMessageTime: number;
  } {
    return {
      connected: this.socket?.readyState === WebSocket.OPEN,
      readyState: this.socket?.readyState ?? 0,
      messageCount: this.messageCount,
      connectionDurationMs: this.connectionStartTime > 0 ? Date.now() - this.connectionStartTime : 0,
      lastMessageTime: this.lastMessageTime,
    };
  }

  connect(url?: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      apiLogger.debug("WebSocket already connected", { currentUrl: this.connectionUrl });
      return;
    }

    this.cancelReconnectTimer();

    const connectUrl = url || this.connectionUrl;
    this.connectionUrl = connectUrl;
    this.connectionStartTime = Date.now();

    try {
      this.socket = new WebSocket(connectUrl, this.connectionProtocols);

      this.socket.onopen = () => {
        this.reconnectDelayMs = 2000;
        const duration = Date.now() - this.connectionStartTime;
        apiLogger.info("WebSocket connection established", {
          url: connectUrl,
          connectionTimeMs: duration,
        });
        apiMonitor.recordRequest({
          id: "ws_connect",
          timestamp: Date.now(),
          path: connectUrl,
          method: "WS",
          status: 101,
          duration,
          success: true,
        });
      };

      this.socket.onmessage = (event) => {
        this.messageCount++;
        this.lastMessageTime = Date.now();

        try {
          const data = JSON.parse(event.data) as unknown;
          apiLogger.debug("WebSocket message received", {
            messageLength: event.data.length,
            messageCount: this.messageCount,
          });

          for (const handler of this.messageHandlers) {
            try {
              handler(data);
            } catch (error) {
              apiLogger.error("WebSocket message handler error", { error });
            }
          }
        } catch (error) {
          apiLogger.error("WebSocket message parse error", { error, rawData: event.data });
        }
      };

      this.socket.onerror = (error) => {
        apiLogger.error("WebSocket error", { error });

        for (const handler of this.errorHandlers) {
          try {
            handler(error);
          } catch (handlerError) {
            apiLogger.error("WebSocket error handler error", { handlerError });
          }
        }

        apiMonitor.recordRequest({
          id: "ws_error",
          timestamp: Date.now(),
          path: connectUrl,
          method: "WS",
          status: 0,
          duration: Date.now() - this.connectionStartTime,
          success: false,
        });
      };

      this.socket.onclose = (event) => {
        const duration = Date.now() - this.connectionStartTime;
        apiLogger.info("WebSocket connection closed", {
          url: connectUrl,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          connectionDurationMs: duration,
        });

        for (const handler of this.closeHandlers) {
          try {
            handler(event.code, event.reason);
          } catch (handlerError) {
            apiLogger.error("WebSocket close handler error", { handlerError });
          }
        }

        this.socket = null;

        if (this.shouldReconnect && event.code !== 1000) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      apiLogger.error("WebSocket connection failed", { error, url: connectUrl });
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  disconnect(code: number = 1000, reason: string = ""): void {
    this.shouldReconnect = false;
    this.cancelReconnectTimer();

    if (this.socket) {
      try {
        this.socket.close(code, reason);
      } catch (error) {
        apiLogger.error("Error closing WebSocket", { error });
      }
      this.socket = null;
    }
  }

  send(data: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      apiLogger.warn("Cannot send: WebSocket not connected", { readyState: this.socket?.readyState });
      return;
    }

    try {
      const serialized = JSON.stringify(data);
      this.socket.send(serialized);
      apiLogger.debug("WebSocket message sent", { messageLength: serialized.length });
    } catch (error) {
      apiLogger.error("WebSocket send error", { error });
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;

    apiLogger.info("Scheduling WebSocket reconnect", { delayMs: this.reconnectDelayMs });

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelayMs = Math.min(
        this.maxReconnectDelayMs,
        Math.round(this.reconnectDelayMs * 1.6),
      );
      this.connect();
    }, this.reconnectDelayMs);
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  destroy(): void {
    this.disconnect();
    this.messageHandlers.clear();
    this.errorHandlers.clear();
    this.closeHandlers.clear();
  }
}

export const wsManager = new WebSocketManager();
