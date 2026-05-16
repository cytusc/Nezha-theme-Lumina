import { z } from "zod";
import type { NodeDisplay, LoadRecordsResponse } from "@/types/monitor";
import {
  NezhaHostSchema,
  NezhaStateSchema,
  NezhaWsPayloadSchema,
  type NezhaStreamServer,
  type NezhaServiceInfo,
} from "./schemas";
import {
  ONLINE_GRACE_MS,
  expireInfoCache,
  EXPIRE_INFO_CACHE_MAX,
  nodeBaseCache,
  type LoadMetricField,
} from "./constants";

export function hoursToPeriod(hours: number) {
  if (hours >= 720) return "30d";
  if (hours >= 168) return "7d";
  return "1d";
}

export function formatOperatingSystem(host: z.infer<typeof NezhaHostSchema> | undefined) {
  if (!host) return "";
  return [host.platform, host.platform_version].filter(Boolean).join(" ");
}

export function normalizeDateTextToIso(dateText: string) {
  const normalized = dateText.trim().replace(/[./]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";

  const [, year, month, day] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? "" : iso;
}

export function normalizeExpireValue(value: unknown) {
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

export function pickStringField(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function extractExpireInfoFromJson(publicNote: string) {
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
    (root.billingDataMod &&
      typeof root.billingDataMod === "object" &&
      !Array.isArray(root.billingDataMod)
      ? (root.billingDataMod as Record<string, unknown>)
      : null) ??
    (root.billingData &&
      typeof root.billingData === "object" &&
      !Array.isArray(root.billingData)
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
    (billingData
      ? pickStringField(billingData, ["remark", "note", "message", "description"])
      : "");

  return { expiredAt, remark };
}

function trimExpireInfoCache() {
  if (expireInfoCache.size >= EXPIRE_INFO_CACHE_MAX) {
    const firstKey = expireInfoCache.keys().next().value;
    if (firstKey !== undefined) expireInfoCache.delete(firstKey);
  }
}

export function extractExpireInfo(publicNote: string) {
  const text = publicNote.trim();
  if (!text) {
    return { expiredAt: "", remark: "" };
  }

  const cached = expireInfoCache.get(text);
  if (cached) return cached;

  const jsonInfo = extractExpireInfoFromJson(text);
  if (jsonInfo && (jsonInfo.expiredAt || jsonInfo.remark !== "")) {
    trimExpireInfoCache();
    expireInfoCache.set(text, jsonInfo);
    return jsonInfo;
  }

  const patterns = [
    /(?:^|[\s,;|/【】\[\]（）()])(?:到期|过期时间|续费|exp|expire|expiry|expires?\s*at)\s*[:：=]?\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})(?:$|[\s,;|/【】\[\]（）()])/i,
    /(?:^|[\s,;|/【】\[\]()])(\d{4}[./-]\d{1,2}[./-]\d{1,2})\s*(?:到期|过期|续费|exp|expire|expiry)(?:$|[\s,;|/【】\[\]（）()])/i,
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

    const result = { expiredAt, remark };
    trimExpireInfoCache();
    expireInfoCache.set(text, result);
    return result;
  }

  const fallback = { expiredAt: "", remark: text };
  trimExpireInfoCache();
  expireInfoCache.set(text, fallback);
  return fallback;
}

export function extractCpuCoreCount(cpuModels: string[]) {
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

const VIRTUAL_GPU_PATTERNS = [
  /orayiddriver/i,
  /oray\s*id/i,
  /向日葵/i,
  /sunlogin/i,
  /remote\s*display/i,
  /rdp/i,
  /vnc/i,
  /virtual\s*display/i,
  /basic\s*display/i,
  /microsoft\s*basic\s*adapter/i,
  /dummy/i,
  /mirror/i,
  /redirect/i,
];

export function isVirtualGpu(gpuName: string): boolean {
  const trimmed = gpuName.trim().toLowerCase();
  return VIRTUAL_GPU_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function formatGpuName(gpuList: string[]): string {
  if (!gpuList || gpuList.length === 0) return "";
  const physicalGpus = gpuList.filter((gpu) => !isVirtualGpu(gpu));
  if (physicalGpus.length === 0) {
    return gpuList[0] || "";
  }
  return physicalGpus.join("\n");
}

export function toTimestamp(value: string | number | null | undefined) {
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

export function isOnline(lastActive: string | number | null | undefined, nowMs: number) {
  const last = toTimestamp(lastActive);
  if (last <= 0) return false;
  return nowMs - last <= ONLINE_GRACE_MS;
}

export function selectPrimaryService(services: NezhaServiceInfo[]) {
  if (services.length === 0) return null;
  return [...services].sort((left, right) => {
    if (left.display_index !== right.display_index) {
      return right.display_index - left.display_index;
    }
    return left.monitor_id - right.monitor_id;
  })[0] ?? null;
}

export function buildPingRecordsFromService(service: NezhaServiceInfo) {
  const size = Math.min(service.created_at.length, service.avg_delay.length);
  return Array.from({ length: size }, (_, index) => ({
    task_id: service.monitor_id,
    time: service.created_at[index] ?? 0,
    value: service.avg_delay[index] ?? 0,
    client: String(service.server_id),
  }));
}

export function assignLoadMetricValue(
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
    gpu_name: formatGpuName(host.gpu),
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
