import { z } from "zod";

/** Schemas accept loose/partial payloads from the server, with sensible defaults. */

const looseString = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v))
  .catch("");
const looseNumber = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? v : Number.parseFloat(v) || 0))
  .catch(0);
const looseBool = z
  .union([z.boolean(), z.number(), z.string()])
  .transform((v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;

    const normalized = v.trim().toLowerCase();
    if (normalized === "" || normalized === "0" || normalized === "false") {
      return false;
    }
    if (normalized === "1" || normalized === "true") {
      return true;
    }

    return Boolean(normalized);
  })
  .catch(false);

export const NodeInfoSchema = z
  .object({
    uuid: z.string(),
    name: looseString.default(""),
    group: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? "" : String(v))),
    region: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? "" : String(v))),
    hidden: looseBool.default(false),
    cpu_name: looseString.default(""),
    cpu_cores: looseNumber.default(0),
    arch: looseString.default(""),
    virtualization: looseString.default(""),
    os: looseString.default(""),
    kernel_version: looseString.default(""),
    gpu_name: looseString.default(""),
    mem_total: looseNumber.default(0),
    swap_total: looseNumber.default(0),
    disk_total: looseNumber.default(0),
    weight: looseNumber.default(0),
    price: looseNumber.default(0),
    billing_cycle: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? "" : String(v))),
    auto_renewal: looseBool.default(false),
    currency: looseString.default(""),
    expired_at: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? "" : String(v))),
    tags: looseString.default(""),
    public_remark: looseString.default(""),
    traffic_limit: looseNumber.default(0),
    traffic_limit_type: looseString.default(""),
    created_at: looseString.default(""),
    updated_at: looseString.default(""),
  })
  .passthrough();

export interface NodeInfo {
  uuid: string;
  name: string;
  group?: string | null;
  region?: string | null;
  hidden: boolean;
  cpu_name: string;
  cpu_cores: number;
  arch: string;
  virtualization: string;
  os: string;
  kernel_version: string;
  gpu_name: string;
  mem_total: number;
  swap_total: number;
  disk_total: number;
  weight: number;
  price: number;
  billing_cycle?: string | null;
  auto_renewal: boolean;
  currency: string;
  expired_at?: string | null;
  tags: string;
  public_remark: string;
  /** Optional traffic quota, unit: bytes. */
  traffic_limit: number;
  traffic_limit_type: string;
  created_at: string;
  updated_at: string;
}

export const NodeRealtimeSchema = z
  .object({
    cpu: z
      .object({ usage: z.number().default(0) })
      .passthrough()
      .default({ usage: 0 }),
    ram: z
      .object({ total: z.number().default(0), used: z.number().default(0) })
      .passthrough()
      .default({ total: 0, used: 0 }),
    swap: z
      .object({ total: z.number().default(0), used: z.number().default(0) })
      .passthrough()
      .default({ total: 0, used: 0 }),
    load: z
      .object({
        load1: z.number().default(0),
        load5: z.number().default(0),
        load15: z.number().default(0),
      })
      .passthrough()
      .default({ load1: 0, load5: 0, load15: 0 }),
    disk: z
      .object({ total: z.number().default(0), used: z.number().default(0) })
      .passthrough()
      .default({ total: 0, used: 0 }),
    network: z
      .object({
        /** Network throughput, unit: bytes per second. */
        up: z.number().default(0),
        /** Network throughput, unit: bytes per second. */
        down: z.number().default(0),
        /** Cumulative traffic total, unit: bytes. */
        totalUp: z.number().default(0),
        /** Cumulative traffic total, unit: bytes. */
        totalDown: z.number().default(0),
      })
      .passthrough()
      .default({ up: 0, down: 0, totalUp: 0, totalDown: 0 }),
    connections: z
      .object({ tcp: z.number().default(0), udp: z.number().default(0) })
      .passthrough()
      .default({ tcp: 0, udp: 0 }),
    uptime: z.number().default(0),
    process: z.number().default(0),
    updated_at: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export interface NodeRealtime {
  cpu: { usage: number };
  ram: { total: number; used: number };
  swap: { total: number; used: number };
  load: { load1: number; load5: number; load15: number };
  disk: { total: number; used: number };
  /** `up/down` are bytes per second, `totalUp/totalDown` are cumulative bytes. */
  network: { up: number; down: number; totalUp: number; totalDown: number };
  connections: { tcp: number; udp: number };
  uptime: number;
  process: number;
  updated_at?: string | number;
}

/** Display model — flat info + realtime metrics + online flag. */
export interface NodeDisplay extends NodeInfo {
  online: boolean;
  cpuPct: number;
  ramUsed: number;
  ramTotal: number;
  ramPct: number;
  swapUsed: number;
  swapTotal: number;
  swapPct: number;
  diskUsed: number;
  diskTotal: number;
  diskPct: number;
  /** Current upload throughput, unit: bytes per second. */
  netUp: number;
  /** Current download throughput, unit: bytes per second. */
  netDown: number;
  /** Cumulative outbound traffic, unit: bytes. */
  trafficUp: number;
  /** Cumulative inbound traffic, unit: bytes. */
  trafficDown: number;
  uptime: number;
  load1: number;
  load5: number;
  load15: number;
  process: number;
  connectionsTcp: number;
  connectionsUdp: number;
  updatedAt: number;
}

export const MeSchema = z
  .object({
    logged_in: z.boolean().default(false),
    username: z.string().default(""),
    uuid: z.string().default(""),
  })
  .passthrough();

export interface Me {
  logged_in: boolean;
  username: string;
  uuid: string;
}

export const VersionSchema = z
  .object({
    version: z.string().default(""),
    hash: z.string().default(""),
  })
  .passthrough();

export interface Version {
  version: string;
  hash: string;
}

export const LoadRecordSchema = z
  .object({
    cpu: z.number().default(0),
    gpu: z.number().default(0),
    ram: z.number().default(0),
    ram_total: z.number().default(0),
    swap: z.number().default(0),
    swap_total: z.number().default(0),
    load: z.number().default(0),
    temp: z.number().default(0),
    disk: z.number().default(0),
    disk_total: z.number().default(0),
    /** Historical network throughput, unit: bytes per second. */
    net_in: z.number().default(0),
    /** Historical network throughput, unit: bytes per second. */
    net_out: z.number().default(0),
    /** Historical cumulative outbound traffic, unit: bytes. */
    net_total_up: z.number().default(0),
    /** Historical cumulative inbound traffic, unit: bytes. */
    net_total_down: z.number().default(0),
    process: z.number().default(0),
    connections: z.number().default(0),
    connections_udp: z.number().default(0),
    time: z.union([z.string(), z.number()]),
    client: z.string().default(""),
  })
  .passthrough();

export interface LoadRecord {
  cpu: number;
  gpu: number;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  load: number;
  temp: number;
  disk: number;
  disk_total: number;
  /** Network throughput, unit: bytes per second. */
  net_in: number;
  /** Network throughput, unit: bytes per second. */
  net_out: number;
  /** Cumulative traffic total, unit: bytes. */
  net_total_up: number;
  /** Cumulative traffic total, unit: bytes. */
  net_total_down: number;
  process: number;
  connections: number;
  connections_udp: number;
  time: string | number;
  client: string;
}

export const PingRecordSchema = z
  .object({
    task_id: z.number(),
    time: z.union([z.string(), z.number()]),
    value: z.number(),
    client: z.string().default(""),
  })
  .passthrough();

export interface PingRecord {
  task_id: number;
  time: string | number;
  value: number;
  client: string;
}

export const PingTaskSchema = z
  .object({
    id: z.number(),
    interval: z.number().default(60),
    name: z.string().default(""),
    loss: z.number().nullable().default(null),
    clients: z.array(z.string()).default([]),
    type: z.string().default("icmp"),
    target: z.string().default(""),
    weight: z.number().default(0),
  })
  .passthrough();

export interface PingTask {
  id: number;
  interval: number;
  name: string;
  loss: number | null;
  clients: string[];
  type: string;
  target: string;
  weight: number;
}

export interface LoadRecordsResponse {
  count: number;
  records: LoadRecord[];
}

export interface PingRecordsResponse {
  count: number;
  records: PingRecord[];
  tasks: PingTask[];
}

export const PingBasicInfoSchema = z
  .object({
    client: z.string().default(""),
    loss: z.number().default(0),
    min: z.number().default(0),
    max: z.number().default(0),
  })
  .passthrough();

export interface PingBasicInfo {
  client: string;
  loss: number;
  min: number;
  max: number;
}

export interface PingOverviewItem {
  client: string;
  isAssigned: boolean;
  lastValue: number | null;
  values: number[];
  samples: Array<{ time: number; value: number }>;
  max: number;
  loss: number | null;
}

export interface TrafficTrendSample {
  value: number;
  level: number;
  opacity: number;
}

export interface PingOverviewBucket {
  index: number;
  value: number | null;
  loss: number | null;
  total: number;
  lost: number;
  startAt: number | null;
  endAt: number | null;
}
