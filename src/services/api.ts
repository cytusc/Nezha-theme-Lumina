import { z } from "zod";
import {
  LoadRecordSchema,
  type LoadRecordsResponse,
  type Me,
  type NodeDisplay,
  type PingOverviewItem,
  type PingRecordsResponse,
  type PingTask,
  type Version,
} from "@/types/monitor";

const ApiEnvelope = <T extends z.ZodTypeAny>(inner: T) =>
  z
    .object({
      success: z.boolean().default(true),
      data: inner.optional(),
      error: z.string().optional(),
    })
    .passthrough();

const NezhaHostSchema = z
  .object({
    platform: z.string().default(""),
    platform_version: z.string().default(""),
    cpu: z.array(z.string()).default([]),
    mem_total: z.number().default(0),
    disk_total: z.number().default(0),
    swap_total: z.number().default(0),
    arch: z.string().default(""),
    virtualization: z.string().default(""),
    version: z.string().default(""),
    gpu: z.array(z.string()).default([]),
  })
  .passthrough();

const NezhaStateSchema = z
  .object({
    cpu: z.number().default(0),
    mem_used: z.number().default(0),
    swap_used: z.number().default(0),
    disk_used: z.number().default(0),
    /** Cumulative inbound traffic, unit: bytes. */
    net_in_transfer: z.number().default(0),
    /** Cumulative outbound traffic, unit: bytes. */
    net_out_transfer: z.number().default(0),
    /** Inbound throughput, unit: bytes per second. */
    net_in_speed: z.number().default(0),
    /** Outbound throughput, unit: bytes per second. */
    net_out_speed: z.number().default(0),
    uptime: z.number().default(0),
    load_1: z.number().default(0),
    load_5: z.number().default(0),
    load_15: z.number().default(0),
    tcp_conn_count: z.number().default(0),
    udp_conn_count: z.number().default(0),
    process_count: z.number().default(0),
  })
  .passthrough();

const NezhaStreamServerSchema = z
  .object({
    id: z.number(),
    name: z.string().default(""),
    public_note: z.string().default(""),
    display_index: z.number().default(0),
    host: NezhaHostSchema.nullish(),
    state: NezhaStateSchema.nullish(),
    country_code: z.string().default(""),
    last_active: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough();

const NezhaWsPayloadSchema = z
  .object({
    now: z.number().default(0),
    online: z.number().default(0),
    servers: z.array(NezhaStreamServerSchema).default([]),
  })
  .passthrough();

const PingOverviewItemSchema = z
  .object({
    client: z.string().default(""),
    isAssigned: z.boolean().default(false),
    lastValue: z.number().nullable().default(null),
    values: z.array(z.number()).default([]),
    samples: z
      .array(
        z
          .object({
            time: z.number().default(0),
            value: z.number().default(0),
          })
          .passthrough(),
      )
      .default([]),
    max: z.number().default(1),
    loss: z.number().nullable().default(null),
  })
  .passthrough();

const PingOverviewMapSchema = z.record(PingOverviewItemSchema).default({});

const HomeBootstrapSchema = z
  .object({
    snapshot: NezhaWsPayloadSchema,
    ping_overviews: PingOverviewMapSchema,
  })
  .passthrough();

const LoadRecordsResponseSchema = z
  .object({
    count: z.number().default(0),
    records: z.array(LoadRecordSchema).default([]),
  })
  .passthrough();

const NezhaMetricPointSchema = z
  .object({
    ts: z.number(),
    value: z.number().default(0),
  })
  .passthrough();

const NezhaServerMetricsSchema = z
  .object({
    server_id: z.number(),
    server_name: z.string().default(""),
    metric: z.string().default(""),
    data_points: z.array(NezhaMetricPointSchema).default([]),
  })
  .passthrough();

const NezhaServiceInfoSchema = z
  .object({
    monitor_id: z.number(),
    server_id: z.number(),
    monitor_name: z.string().default(""),
    server_name: z.string().default(""),
    display_index: z.number().default(0),
    created_at: z.array(z.number()).default([]),
    avg_delay: z.array(z.number()).default([]),
  })
  .passthrough();

const NezhaSettingSchema = z
  .object({
    config: z
      .object({
        site_name: z.string().default(""),
        custom_code: z.string().default(""),
        custom_code_dashboard: z.string().default(""),
        user_template: z.string().default(""),
        oauth2_providers: z.array(z.string()).default([]),
      })
      .passthrough()
      .default({}),
    version: z.string().default(""),
    frontend_templates: z.array(z.unknown()).default([]),
    tsdb_enabled: z.boolean().default(false),
  })
  .passthrough();

const NezhaProfileSchema = z
  .object({
    user: z
      .object({
        id: z.number().optional(),
        username: z.string().default(""),
      })
      .passthrough(),
  })
  .passthrough();

export type NezhaStreamServer = z.infer<typeof NezhaStreamServerSchema>;
export type HomeBootstrapPayload = z.infer<typeof HomeBootstrapSchema>;

type CachedNodeBase = {
  serverId: number;
  ramTotal: number;
  swapTotal: number;
  diskTotal: number;
};

type CachedServiceEntry = {
  expiresAt: number;
  data: NezhaServiceInfo[];
};

type NezhaServiceInfo = z.infer<typeof NezhaServiceInfoSchema>;

const nodeBaseCache = new Map<string, CachedNodeBase>();
const serviceCache = new Map<string, CachedServiceEntry>();
const SERVICE_CACHE_TTL_MS = 30_000;
const GUEST_HISTORY_HOURS = 24;
const ONLINE_GRACE_MS = 65_000;

/**
 * Map Nezha metric keys to the local historical record model.
 *
 * Naming convention reminder:
 * - `net_in` / `net_out` are network throughput, unit: bytes per second
 * - `net_total_down` / `net_total_up` are cumulative traffic totals, unit: bytes
 */
const LOAD_METRIC_MAP = {
  cpu: "cpu",
  memory: "ram",
  swap: "swap",
  disk: "disk",
  net_in_speed: "net_in",
  net_out_speed: "net_out",
  net_in_transfer: "net_total_down",
  net_out_transfer: "net_total_up",
  load1: "load",
  tcp_conn: "connections",
  udp_conn: "connections_udp",
  process_count: "process",
} as const;

type LoadMetricField = (typeof LOAD_METRIC_MAP)[keyof typeof LOAD_METRIC_MAP];

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function hoursToPeriod(hours: number) {
  if (hours >= 720) return "30d";
  if (hours >= 168) return "7d";
  return "1d";
}

function formatOperatingSystem(host: z.infer<typeof NezhaHostSchema> | undefined) {
  if (!host) return "";
  return [host.platform, host.platform_version].filter(Boolean).join(" ");
}

function normalizeDateTextToIso(dateText: string) {
  const normalized = dateText.trim().replace(/[./]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";

  const [, year, month, day] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? "" : iso;
}

function normalizeExpireValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const date = new Date(value > 1_000_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  if (typeof value !== "string") return "";

  const text = value.trim();
  if (!text) return "";

  const normalizedDate = normalizeDateTextToIso(text);
  if (normalizedDate) return normalizedDate;

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return "";

  return new Date(parsed).toISOString();
}

function pickStringField(
  source: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function extractExpireInfoFromJson(publicNote: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(publicNote);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { expiredAt: "", remark: "" };
  }

  const root = parsed as Record<string, unknown>;
  const billingData =
    (root.billingDataMod && typeof root.billingDataMod === "object" && !Array.isArray(root.billingDataMod)
      ? (root.billingDataMod as Record<string, unknown>)
      : null) ??
    (root.billingData && typeof root.billingData === "object" && !Array.isArray(root.billingData)
      ? (root.billingData as Record<string, unknown>)
      : null);

  const expiredAt =
    normalizeExpireValue(billingData?.endDate) ||
    normalizeExpireValue(root.endDate) ||
    normalizeExpireValue(root.expired_at) ||
    normalizeExpireValue(root.expiredAt) ||
    normalizeExpireValue(root.expire_at) ||
    normalizeExpireValue(root.expireAt) ||
    normalizeExpireValue(root.expire) ||
    normalizeExpireValue(root.expiration) ||
    normalizeExpireValue(root.expires_at) ||
    normalizeExpireValue(root.expiresAt);

  const remark =
    pickStringField(root, ["remark", "public_remark", "publicRemark", "note", "message", "description"]) ||
    (billingData ? pickStringField(billingData, ["remark", "note", "message", "description"]) : "");

  return {
    expiredAt,
    remark,
  };
}

function extractExpireInfo(publicNote: string) {
  const text = publicNote.trim();
  if (!text) {
    return { expiredAt: "", remark: "" };
  }

  const jsonInfo = extractExpireInfoFromJson(text);
  if (jsonInfo && (jsonInfo.expiredAt || jsonInfo.remark !== "")) {
    return jsonInfo;
  }

  const patterns = [
    /(?:^|[\s,;|/【】\[\]（）()])(?:到期|过期时间|续费|exp|expire|expiry|expires?\s*at)\s*[:：=]?\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})(?:$|[\s,;|/【】\[\]（）()])/i,
    /(?:^|[\s,;|/【】\[\]（）()])(\d{4}[./-]\d{1,2}[./-]\d{1,2})\s*(?:到期|过期|续费|exp|expire|expiry)(?:$|[\s,;|/【】\[\]（）()])/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const dateText = match?.[1];
    if (!dateText) continue;

    const expiredAt = normalizeDateTextToIso(dateText);
    if (!expiredAt) continue;

    const remark = text
      .replace(match[0], " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[,;|/，。；、\s]+|[,;|/，。；、\s]+$/g, "");

    return {
      expiredAt,
      remark,
    };
  }

  return {
    expiredAt: "",
    remark: text,
  };
}

function extractCpuCoreCount(cpuModels: string[]) {
  for (const model of cpuModels) {
    const match =
      model.match(/(\d+)\s+(?:Virtual|Physical)\s+Core/i) ??
      model.match(/(\d+)\s+Cores?/i);

    if (!match) continue;

    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return cpuModels.length;
}

function toTimestamp(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isOnline(lastActive: string | number | null | undefined, nowMs: number) {
  const last = toTimestamp(lastActive);
  if (last <= 0) return false;
  return nowMs - last <= ONLINE_GRACE_MS;
}

async function apiGet<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  options?: {
    signal?: AbortSignal;
  },
): Promise<z.output<TSchema>> {
  const resp = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal: options?.signal,
  });

  if (!resp.ok) {
    throw new ApiRequestError(`Request ${path} failed: ${resp.status}`, resp.status, path);
  }

  const json = (await resp.json()) as unknown;
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
    `Schema mismatch on ${path}: ${envelopeResult.success ? "empty data" : envelopeResult.error.issues[0]?.message ?? "unknown"}`,
  );
}

async function getSettingPayload() {
  return await apiGet("/api/v1/setting", NezhaSettingSchema);
}

async function getServerServices(serverId: number, period: string): Promise<NezhaServiceInfo[]> {
  const cacheKey = `${serverId}:${period}`;
  const cached = serviceCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const data = await apiGet(
    `/api/v1/server/${serverId}/service?period=${period}`,
    z.array(NezhaServiceInfoSchema),
  );
  serviceCache.set(cacheKey, {
    expiresAt: now + SERVICE_CACHE_TTL_MS,
    data,
  });
  return data;
}

function selectPrimaryService(services: NezhaServiceInfo[]) {
  if (services.length === 0) return null;
  return [...services].sort((left, right) => {
    if (left.display_index !== right.display_index) {
      return right.display_index - left.display_index;
    }
    return left.monitor_id - right.monitor_id;
  })[0] ?? null;
}

function buildPingRecordsFromService(service: NezhaServiceInfo) {
  const size = Math.min(service.created_at.length, service.avg_delay.length);
  return Array.from({ length: size }, (_, index) => ({
    task_id: service.monitor_id,
    time: service.created_at[index] ?? 0,
    value: service.avg_delay[index] ?? 0,
    client: String(service.server_id),
  }));
}

export function rememberNodeDisplay(node: NodeDisplay) {
  const serverId = Number.parseInt(node.uuid, 10);
  if (!Number.isFinite(serverId) || serverId <= 0) return;
  nodeBaseCache.set(node.uuid, {
    serverId,
    ramTotal: node.ramTotal || node.mem_total,
    swapTotal: node.swapTotal || node.swap_total,
    diskTotal: node.diskTotal || node.disk_total,
  });
}

export function parseServerStreamPayload(payload: unknown) {
  const parsed = NezhaWsPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid /api/v1/ws/server payload");
  }
  return parsed.data;
}

export function mapStreamServerToNodeDisplay(
  server: NezhaStreamServer,
  nowMs = Date.now(),
): NodeDisplay {
  const host = server.host ?? NezhaHostSchema.parse({});
  const state = server.state ?? NezhaStateSchema.parse({});
  const lastActiveTs = toTimestamp(server.last_active);
  const expireInfo = extractExpireInfo(server.public_note || "");

  return {
    uuid: String(server.id),
    name: server.name || `Server #${server.id}`,
    group: "",
    region: server.country_code || "",
    hidden: false,
    cpu_name: host.cpu[0] || "",
    cpu_cores: extractCpuCoreCount(host.cpu),
    arch: host.arch || "",
    virtualization: host.virtualization || "",
    os: formatOperatingSystem(host),
    kernel_version: host.version || "",
    gpu_name: host.gpu[0] || "",
    mem_total: host.mem_total || 0,
    swap_total: host.swap_total || 0,
    disk_total: host.disk_total || 0,
    weight: -server.display_index,
    price: 0,
    billing_cycle: "",
    auto_renewal: false,
    currency: "",
    expired_at: expireInfo.expiredAt,
    tags: "",
    public_remark: expireInfo.remark,
    traffic_limit: 0,
    traffic_limit_type: "",
    created_at: "",
    updated_at: server.last_active == null ? "" : String(server.last_active),
    online: isOnline(server.last_active, nowMs),
    cpuPct: state.cpu || 0,
    ramUsed: state.mem_used || 0,
    ramTotal: host.mem_total || 0,
    ramPct: host.mem_total > 0 ? ((state.mem_used || 0) / host.mem_total) * 100 : 0,
    swapUsed: state.swap_used || 0,
    swapTotal: host.swap_total || 0,
    swapPct: host.swap_total > 0 ? ((state.swap_used || 0) / host.swap_total) * 100 : 0,
    diskUsed: state.disk_used || 0,
    diskTotal: host.disk_total || 0,
    diskPct: host.disk_total > 0 ? ((state.disk_used || 0) / host.disk_total) * 100 : 0,
    netUp: state.net_out_speed || 0,
    netDown: state.net_in_speed || 0,
    trafficUp: state.net_out_transfer || 0,
    trafficDown: state.net_in_transfer || 0,
    uptime: state.uptime || 0,
    load1: state.load_1 || 0,
    load5: state.load_5 || 0,
    load15: state.load_15 || 0,
    process: state.process_count || 0,
    connectionsTcp: state.tcp_conn_count || 0,
    connectionsUdp: state.udp_conn_count || 0,
    updatedAt: lastActiveTs > 0 ? lastActiveTs : nowMs,
  };
}

export function getServerStreamUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/v1/ws/server`;
}

export async function getHomeBootstrap(): Promise<HomeBootstrapPayload> {
  return await apiGet("/lumina-api/home-bootstrap", HomeBootstrapSchema);
}

export async function getHomepagePingOverviewBatch(
  uuids: string[],
  options?: {
    signal?: AbortSignal;
  },
): Promise<Record<string, PingOverviewItem>> {
  const normalized = Array.from(new Set(uuids.map((uuid) => uuid.trim()).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, undefined, { numeric: true }),
  );

  if (normalized.length === 0) return {};

  const search = new URLSearchParams();
  search.set("uuids", normalized.join(","));
  return await apiGet(`/lumina-api/ping-overview?${search.toString()}`, PingOverviewMapSchema, options);
}

export async function getMe(): Promise<Me> {
  try {
    const profile = await apiGet("/api/v1/profile", NezhaProfileSchema);
    return {
      logged_in: true,
      username: profile.user.username || "",
      uuid: profile.user.id != null ? String(profile.user.id) : profile.user.username || "",
    };
  } catch {
    return { logged_in: false, username: "", uuid: "" };
  }
}

export async function getVersion(): Promise<Version> {
  const setting = await getSettingPayload();
  return {
    version: setting.version || "",
    hash: "",
  };
}

async function getMetricSeries(serverId: number, metric: string, period: string) {
  return await apiGet(
    `/api/v1/server/${serverId}/metrics?metric=${metric}&period=${period}`,
    NezhaServerMetricsSchema,
  );
}

async function getAggregatedLoadRecords(
  uuid: string,
  hours: number,
): Promise<LoadRecordsResponse> {
  const search = new URLSearchParams();
  search.set("uuid", uuid);
  search.set("hours", String(hours));
  return await apiGet(`/lumina-api/load-records?${search.toString()}`, LoadRecordsResponseSchema);
}

function assignLoadMetricValue(
  target: LoadRecordsResponse["records"][number],
  field: LoadMetricField,
  value: number,
) {
  switch (field) {
    case "cpu":
      target.cpu = value;
      break;
    case "ram":
      target.ram = value;
      break;
    case "swap":
      target.swap = value;
      break;
    case "disk":
      target.disk = value;
      break;
    case "net_in":
      target.net_in = value;
      break;
    case "net_out":
      target.net_out = value;
      break;
    case "net_total_down":
      target.net_total_down = value;
      break;
    case "net_total_up":
      target.net_total_up = value;
      break;
    case "load":
      target.load = value;
      break;
    case "connections":
      target.connections = value;
      break;
    case "connections_udp":
      target.connections_udp = value;
      break;
    case "process":
      target.process = value;
      break;
  }
}

export async function getLoadRecords(
  uuid: string,
  hours = GUEST_HISTORY_HOURS,
): Promise<LoadRecordsResponse> {
  try {
    return await getAggregatedLoadRecords(uuid, hours);
  } catch {
    // sidecar 聚合不可用时回退到原有多 metrics 拼装，避免详情页直接失效。
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
      payload: await getMetricSeries(serverId, metric, period),
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

export async function getPingRecords(
  uuid: string,
  hours = GUEST_HISTORY_HOURS,
): Promise<PingRecordsResponse> {
  const serverId = Number.parseInt(uuid, 10);
  if (!Number.isFinite(serverId) || serverId <= 0) {
    return { count: 0, records: [], tasks: [] };
  }

  const period = hoursToPeriod(hours);
  const services = await getServerServices(serverId, period);
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
      type: "service",
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

export async function getPrimaryServiceOverview(uuid: string): Promise<PingOverviewItem> {
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

  const services = await getServerServices(serverId, "1d");
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
