export const GUEST_HISTORY_HOURS = 24;
export const ONLINE_GRACE_MS = 65_000;

export const LOAD_METRIC_MAP = {
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

export type LoadMetricField = (typeof LOAD_METRIC_MAP)[keyof typeof LOAD_METRIC_MAP];

export type CachedNodeBase = {
  serverId: number;
  ramTotal: number;
  swapTotal: number;
  diskTotal: number;
};

export const nodeBaseCache = new Map<string, CachedNodeBase>();

export const expireInfoCache = new Map<string, { expiredAt: string; remark: string }>();
export const EXPIRE_INFO_CACHE_MAX = 200;
