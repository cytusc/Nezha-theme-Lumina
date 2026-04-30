import type { LogLevel, LogEntry } from "../types";

class ApiLogger {
  private logBuffer: LogEntry[] = [];
  private maxBufferSize: number = 1000;
  private logLevel: LogLevel = this.getLogLevelFromEnv();
  private listeners: Set<(entry: LogEntry) => void> = new Set();

  private getLogLevelFromEnv(): LogLevel {
    if (typeof window === "undefined") return "warn";

    const envLevel = import.meta.env?.VITE_API_LOG_LEVEL as string | undefined;
    if (envLevel && ["debug", "info", "warn", "error"].includes(envLevel)) {
      return envLevel as LogLevel;
    }

    return import.meta.env?.DEV ? "debug" : "warn";
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.logLevel];
  }

  private addEntry(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): LogEntry {
    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      message,
      context,
      error,
    };

    if (this.shouldLog(level)) {
      this.logBuffer.push(entry);

      if (this.logBuffer.length > this.maxBufferSize) {
        this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
      }

      this.notifyListeners(entry);

      this.logToConsole(entry);
    }

    return entry;
  }

  private logToConsole(entry: LogEntry): void {
    const prefix = `[API ${entry.level.toUpperCase()}]`;
    const time = new Date(entry.timestamp).toISOString();

    switch (entry.level) {
      case "debug":
        console.debug(prefix, time, entry.message, entry.context ?? "");
        break;
      case "info":
        console.info(prefix, time, entry.message, entry.context ?? "");
        break;
      case "warn":
        console.warn(prefix, time, entry.message, entry.context ?? "");
        break;
      case "error":
        console.error(prefix, time, entry.message, entry.context ?? "", entry.error ?? "");
        break;
    }
  }

  private notifyListeners(entry: LogEntry): void {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // 忽略监听器错误
      }
    }
  }

  debug(message: string, context?: Record<string, unknown>): LogEntry {
    return this.addEntry("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): LogEntry {
    return this.addEntry("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): LogEntry {
    return this.addEntry("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>, error?: Error): LogEntry {
    return this.addEntry("error", message, context, error);
  }

  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLogs(
    filter?: {
      level?: LogLevel;
      since?: number;
      until?: number;
      pathPattern?: string;
    },
  ): LogEntry[] {
    let logs = [...this.logBuffer];

    if (filter) {
      if (filter.level) {
        logs = logs.filter((log) => log.level === filter.level);
      }
      if (filter.since) {
        logs = logs.filter((log) => log.timestamp >= filter.since!);
      }
      if (filter.until) {
        logs = logs.filter((log) => log.timestamp <= filter.until!);
      }
      if (filter.pathPattern) {
        const regex = new RegExp(filter.pathPattern);
        logs = logs.filter((log) =>
          regex.test((log.context?.path as string) ?? ""),
        );
      }
    }

    return logs;
  }

  clearLogs(): void {
    this.logBuffer = [];
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  exportLogs(): string {
    return JSON.stringify(this.logBuffer, null, 2);
  }
}

export const apiLogger = new ApiLogger();
