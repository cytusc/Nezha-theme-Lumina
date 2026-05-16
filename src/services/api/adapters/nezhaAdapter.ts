import { z } from "zod";
import { httpClient } from "../core/httpClient";
import { apiLogger } from "../monitoring/apiLogger";
import { cacheManager, CacheTier } from "../core/cacheManager";
import { requestDeduplicator } from "../core/requestDeduplicator";
import {
  ApiEnvelope,
  NezhaSettingSchema,
  NezhaProfileSchema,
  NezhaServiceInfoSchema,
  NezhaServerMetricsSchema,
  HomeBootstrapSchema,
  PingOverviewMapSchema,
  LoadRecordsResponseSchema,
  type HomeBootstrapPayload,
  type NezhaServiceInfo,
} from "../schemas";
import {
  GUEST_HISTORY_HOURS,
  LOAD_METRIC_MAP,
  nodeBaseCache,
} from "../constants";
import {
  hoursToPeriod,
  toTimestamp,
  getServerStreamUrl,
  selectPrimaryService,
  buildPingRecordsFromService,
  assignLoadMetricValue,
} from "../utils";
import type {
  LoadRecordsResponse,
  Me,
  PingOverviewItem,
  PingRecordsResponse,
  PingTask,
  Version,
} from "@/types/monitor";

async function validatedGet<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  options?: { signal?: AbortSignal },
): Promise<z.output<TSchema>> {
  apiLogger.debug("Nezha API Request", { path });

  try {
    const response = await httpClient.get(path, undefined, options);
    const json = response.data as unknown;

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

    if (envelopeResult.success && envelopeResult.data.success !== false) {
      const fallback = schema.safeParse(undefined);
      if (fallback.success) return fallback.data;
    }

    throw new Error(
      `Schema mismatch on ${path}: ${
        envelopeResult.success ? "empty data" : envelopeResult.error.issues[0]?.message ?? "unknown"
      }`,
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const apiErr = error as { code?: string; message?: string; path?: string };
      if (apiErr.code === "ABORTED") throw error;
    }
    const errMsg = error instanceof Error ? error.message : (typeof error === "object" ? JSON.stringify(error) : String(error));
    apiLogger.error("Nezha API Error", { path }, new Error(errMsg));
    throw error;
  }
}

class NezhaApiAdapter {
  async getSetting() {
    return await validatedGet("/api/v1/setting", NezhaSettingSchema);
  }

  async getServerServices(serverId: number, period: string): Promise<NezhaServiceInfo[]> {
    const cacheKey = `server:${serverId}:services:${period}`;
    return await cacheManager.get<NezhaServiceInfo[]>(
      cacheKey,
      CacheTier.MODERATE,
      () => validatedGet(
        `/api/v1/server/${serverId}/service?period=${period}`,
        z.array(NezhaServiceInfoSchema),
      ),
    );
  }

  getServerStreamUrl(): string {
    return getServerStreamUrl();
  }

  async getHomeSnapshot(options?: { signal?: AbortSignal }): Promise<unknown | null> {
    try {
      const response = await httpClient.get("/lumina-api/home-snapshot", undefined, {
        timeout: 5000,
        ...options,
      });
      const json = response.data as Record<string, unknown> | undefined;
      if (json && typeof json === "object" && "data" in json) {
        const data = json.data as Record<string, unknown> | undefined;
        if (data?.snapshot) return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  async getHomeBootstrap(): Promise<HomeBootstrapPayload> {
    return await requestDeduplicator.deduplicate(
      "home-bootstrap",
      () => validatedGet("/lumina-api/home-bootstrap", HomeBootstrapSchema),
    );
  }

  async getHomepagePingOverviewBatch(
    uuids: string[],
    options?: { signal?: AbortSignal },
  ): Promise<Record<string, PingOverviewItem>> {
    const normalized = Array.from(new Set(uuids.map((uuid) => uuid.trim()).filter(Boolean))).sort(
      (left, right) => left.localeCompare(right, undefined, { numeric: true }),
    );

    if (normalized.length === 0) return {};

    const search = new URLSearchParams();
    search.set("uuids", normalized.join(","));
    const path = `/lumina-api/ping-overview?${search.toString()}`;
    const dedupeKey = `ping-overview-batch:${normalized.join(",")}`;

    return await requestDeduplicator.deduplicate(
      dedupeKey,
      () => validatedGet(path, PingOverviewMapSchema, options),
    );
  }

  async getMe(): Promise<Me> {
    try {
      const profile = await validatedGet("/api/v1/profile", NezhaProfileSchema);
      return {
        logged_in: true,
        username: profile.user.username || "",
        uuid: profile.user.id != null ? String(profile.user.id) : profile.user.username || "",
      };
    } catch {
      return { logged_in: false, username: "", uuid: "" };
    }
  }

  async getVersion(): Promise<Version> {
    const setting = await this.getSetting();
    return {
      version: setting.version || "",
      hash: "",
    };
  }

  async getMetricSeries(serverId: number, metric: string, period: string) {
    return await validatedGet(
      `/api/v1/server/${serverId}/metrics?metric=${metric}&period=${period}`,
      NezhaServerMetricsSchema,
    );
  }

  async getAggregatedLoadRecords(uuid: string, hours: number): Promise<LoadRecordsResponse> {
    const search = new URLSearchParams();
    search.set("uuid", uuid);
    search.set("hours", String(hours));
    return await validatedGet(`/lumina-api/load-records?${search.toString()}`, LoadRecordsResponseSchema);
  }

  async getLoadRecords(uuid: string, hours = GUEST_HISTORY_HOURS): Promise<LoadRecordsResponse> {
    try {
      return await this.getAggregatedLoadRecords(uuid, hours);
    } catch {
      // Fallback to multi-metric approach
    }

    const serverId = Number.parseInt(uuid, 10);
    if (!Number.isFinite(serverId) || serverId <= 0) {
      return { count: 0, records: [] };
    }

    const period = hoursToPeriod(hours);
    const totals = nodeBaseCache.get(uuid) ?? {
      serverId,
      ramTotal: 0,
      swapTotal: 0,
      diskTotal: 0,
    };

    const metricNames = Object.keys(LOAD_METRIC_MAP) as Array<keyof typeof LOAD_METRIC_MAP>;
    const metricResults = await Promise.all(
      metricNames.map(async (metric) => ({
        metric,
        payload: await this.getMetricSeries(serverId, metric, period),
      })),
    );

    const pointMap = new Map<number, LoadRecordsResponse["records"][number]>();
    const ensurePoint = (time: number) => {
      const timestamp = time > 1_000_000_000_000 ? time : time * 1000;
      const current = pointMap.get(timestamp);
      if (current) return current;
      const created = {
        cpu: 0,
        gpu: 0,
        ram: 0,
        ram_total: totals.ramTotal,
        swap: 0,
        swap_total: totals.swapTotal,
        load: 0,
        temp: 0,
        disk: 0,
        disk_total: totals.diskTotal,
        net_in: 0,
        net_out: 0,
        net_total_up: 0,
        net_total_down: 0,
        process: 0,
        connections: 0,
        connections_udp: 0,
        time: timestamp,
        client: uuid,
      };
      pointMap.set(timestamp, created);
      return created;
    };

    for (const { metric, payload } of metricResults) {
      const field = LOAD_METRIC_MAP[metric];
      for (const point of payload.data_points) {
        const target = ensurePoint(point.ts);
        assignLoadMetricValue(target, field, point.value);
      }
    }

    const records = [...pointMap.values()].sort((left, right) => Number(left.time) - Number(right.time));
    return {
      count: records.length,
      records,
    };
  }

  async getPingRecords(uuid: string, hours = GUEST_HISTORY_HOURS): Promise<PingRecordsResponse> {
    const serverId = Number.parseInt(uuid, 10);
    if (!Number.isFinite(serverId) || serverId <= 0) {
      return { count: 0, records: [], tasks: [] };
    }

    const period = hoursToPeriod(hours);
    const services = await this.getServerServices(serverId, period);
    const intervalSeconds = period === "30d" ? 7200 : period === "7d" ? 1800 : 30;

    const tasks: PingTask[] = [...services]
      .sort((left, right) => {
        if (left.display_index !== right.display_index) {
          return right.display_index - left.display_index;
        }
        return left.monitor_id - right.monitor_id;
      })
      .map((service) => ({
        id: service.monitor_id,
        interval: intervalSeconds,
        name: service.monitor_name || `服务 #${service.monitor_id}`,
        loss: null,
        clients: [uuid],
        type: "service" as const,
        target: service.server_name || uuid,
        weight: service.display_index,
      }));

    const records = services.flatMap(buildPingRecordsFromService);
    return {
      count: records.length,
      records,
      tasks,
    };
  }

  async getPrimaryServiceOverview(uuid: string): Promise<PingOverviewItem> {
    const serverId = Number.parseInt(uuid, 10);
    if (!Number.isFinite(serverId) || serverId <= 0) {
      return {
        client: uuid,
        isAssigned: false,
        lastValue: null,
        values: [],
        samples: [],
        max: 1,
        loss: null,
      };
    }

    const services = await this.getServerServices(serverId, "1d");
    const primary = selectPrimaryService(services);
    if (!primary) {
      return {
        client: uuid,
        isAssigned: false,
        lastValue: null,
        values: [],
        samples: [],
        max: 1,
        loss: null,
      };
    }

    const records = buildPingRecordsFromService(primary);
    const samples = records
      .map((record) => ({
        time: toTimestamp(record.time),
        value: record.value,
      }))
      .filter((sample) => sample.time > 0)
      .sort((left, right) => left.time - right.time);
    const values = samples.map((sample) => sample.value);
    const positives = values.filter((value) => value > 0);
    const lastPositive = [...values].reverse().find((value) => value > 0) ?? null;
    const lost = values.filter((value) => value <= 0).length;

    return {
      client: uuid,
      isAssigned: true,
      lastValue: lastPositive,
      values,
      samples,
      max: positives.length > 0 ? Math.max(...positives) : 1,
      loss: values.length > 0 ? (lost / values.length) * 100 : null,
    };
  }
}

export const nezhaAdapter = new NezhaApiAdapter();
