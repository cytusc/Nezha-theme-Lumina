import type { ApiMetrics, EndpointMetrics, RequestLogEntry } from "../types";

interface RequestRecord {
  id: string;
  timestamp: number;
  path: string;
  method: string;
  status: number;
  duration: number;
  success: boolean;
}

class ApiMonitor {
  private requests: RequestRecord[] = [];
  private maxRecords: number = 10000;
  private endpoints: Map<string, EndpointMetrics> = new Map();
  private listeners: Set<(metrics: ApiMetrics) => void> = new Set();
  private updateListeners: Set<(endpoint: string, metrics: EndpointMetrics) => void> = new Set();

  recordRequest(entry: Partial<RequestLogEntry> & { success?: boolean }): void {
    const record: RequestRecord = {
      id: entry.id ?? "",
      timestamp: entry.timestamp ?? Date.now(),
      path: entry.path ?? "",
      method: entry.method ?? "GET",
      status: entry.status ?? 0,
      duration: entry.duration ?? 0,
      success: entry.success ?? false,
    };

    this.requests.push(record);

    if (this.requests.length > this.maxRecords) {
      this.requests = this.requests.slice(-this.maxRecords);
    }

    this.updateEndpointMetrics(record);
    this.notifyGlobalListeners();
    this.notifyEndpointListeners(record.path);
  }

  private updateEndpointMetrics(record: RequestRecord): void {
    const key = `${record.method} ${record.path}`;
    let metrics = this.endpoints.get(key);

    if (!metrics) {
      metrics = {
        count: 0,
        successCount: 0,
        failCount: 0,
        avgDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        lastCalledAt: 0,
        lastStatus: 0,
      };
      this.endpoints.set(key, metrics);
    }

    metrics.count++;
    metrics.lastCalledAt = record.timestamp;
    metrics.lastStatus = record.status;

    if (record.success) {
      metrics.successCount++;
    } else {
      metrics.failCount++;
    }

    if (record.duration < metrics.minDuration) {
      metrics.minDuration = record.duration;
    }
    if (record.duration > metrics.maxDuration) {
      metrics.maxDuration = record.duration;
    }

    const totalDuration = metrics.avgDuration * (metrics.count - 1) + record.duration;
    metrics.avgDuration = totalDuration / metrics.count;
  }

  getMetrics(): ApiMetrics {
    const totalRequests = this.requests.length;
    const successfulRequests = this.requests.filter((r) => r.success).length;
    const failedRequests = totalRequests - successfulRequests;

    const averageResponseTime =
      totalRequests > 0
        ? this.requests.reduce((sum, r) => sum + r.duration, 0) / totalRequests
        : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      cacheHitRate: 0,
      requestsByEndpoint: Object.fromEntries(this.endpoints),
    };
  }

  getEndpointMetrics(path: string, method?: string): EndpointMetrics | undefined {
    const key = method ? `${method} ${path}` : path;
    const exactMatch = this.endpoints.get(key);
    if (exactMatch) return exactMatch;

    for (const [endpointKey, metrics] of this.endpoints) {
      if (endpointKey.includes(path)) {
        return metrics;
      }
    }

    return undefined;
  }

  getRecentRequests(
    limit: number = 50,
    filter?: {
      path?: string;
      method?: string;
      success?: boolean;
      since?: number;
    },
  ): RequestRecord[] {
    let records = [...this.requests].reverse().slice(0, limit);

    if (filter) {
      if (filter.path) {
        records = records.filter((r) => r.path.includes(filter.path!));
      }
      if (filter.method) {
        records = records.filter((r) => r.method === filter.method);
      }
      if (filter.success !== undefined) {
        records = records.filter((r) => r.success === filter.success);
      }
      if (filter.since) {
        records = records.filter((r) => r.timestamp >= filter.since!);
      }
    }

    return records;
  }

  getSuccessRate(): number {
    const metrics = this.getMetrics();
    if (metrics.totalRequests === 0) return 1;
    return metrics.successfulRequests / metrics.totalRequests;
  }

  getAverageResponseTime(): number {
    return this.getMetrics().averageResponseTime;
  }

  getP95ResponseTime(): number {
    if (this.requests.length === 0) return 0;

    const sorted = [...this.requests]
      .map((r) => r.duration)
      .sort((a, b) => a - b);

    const p95Index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[p95Index] ?? 0;
  }

  getP99ResponseTime(): number {
    if (this.requests.length === 0) return 0;

    const sorted = [...this.requests]
      .map((r) => r.duration)
      .sort((a, b) => a - b);

    const p99Index = Math.ceil(sorted.length * 0.99) - 1;
    return sorted[p99Index] ?? 0;
  }

  getErrorRate(): number {
    return 1 - this.getSuccessRate();
  }

  getRequestsPerMinute(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;

    const recentRequests = this.requests.filter((r) => r.timestamp >= oneMinuteAgo);
    return recentRequests.length;
  }

  subscribe(listener: (metrics: ApiMetrics) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeToEndpoint(
    _endpoint: string,
    listener: (metrics: EndpointMetrics) => void,
  ): () => void {
    const wrappedListener = (_ep: string, metrics: EndpointMetrics) => listener(metrics);
    this.updateListeners.add(wrappedListener);
    return () => this.updateListeners.delete(wrappedListener);
  }

  private notifyGlobalListeners(): void {
    const metrics = this.getMetrics();
    for (const listener of this.listeners) {
      try {
        listener(metrics);
      } catch {
        // 忽略监听器错误
      }
    }
  }

  private notifyEndpointListeners(path: string): void {
    const metrics = this.getEndpointMetrics(path);
    if (!metrics) return;

    for (const listener of this.updateListeners) {
      try {
        listener(path, metrics);
      } catch {
        // 忽略监听器错误
      }
    }
  }

  reset(): void {
    this.requests = [];
    this.endpoints.clear();
  }

  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.getMetrics(),
      recentRequests: this.getRecentRequests(100),
      exportTimestamp: Date.now(),
    }, null, 2);
  }
}

export const apiMonitor = new ApiMonitor();
