import type { NodeDisplay, TrafficTrendSample } from "@/types/monitor";

export interface TrafficTrendSeries {
  buffer: TrafficTrendSample[];
  start: number;
  size: number;
  signature: string;
  snapshot: TrafficTrendSample[];
}

export interface NodeTrafficTrend {
  up: TrafficTrendSeries;
  down: TrafficTrendSeries;
  snapshot: {
    up: TrafficTrendSample[];
    down: TrafficTrendSample[];
  };
}

export const TRAFFIC_TREND_SAMPLE_COUNT = 18;

export const EMPTY_TRAFFIC_TREND_SAMPLE: TrafficTrendSample = {
  value: 0,
  level: 0.25,
  opacity: 0.52,
};

export const EMPTY_TRAFFIC_TREND_SNAPSHOT = Array.from(
  { length: TRAFFIC_TREND_SAMPLE_COUNT },
  () => EMPTY_TRAFFIC_TREND_SAMPLE,
);

export const EMPTY_TRAFFIC_TREND_SERIES: TrafficTrendSeries = {
  buffer: [],
  start: 0,
  size: 0,
  signature: "",
  snapshot: EMPTY_TRAFFIC_TREND_SNAPSHOT,
};

export const EMPTY_NODE_TRAFFIC_TREND_SNAPSHOT = {
  up: EMPTY_TRAFFIC_TREND_SNAPSHOT,
  down: EMPTY_TRAFFIC_TREND_SNAPSHOT,
};

export const EMPTY_TRAFFIC_TREND: NodeTrafficTrend = {
  up: EMPTY_TRAFFIC_TREND_SERIES,
  down: EMPTY_TRAFFIC_TREND_SERIES,
  snapshot: EMPTY_NODE_TRAFFIC_TREND_SNAPSHOT,
};

export function shallowEqualDisplay(a: NodeDisplay, b: NodeDisplay): boolean {
  if (a.updatedAt === b.updatedAt && a.uuid === b.uuid) {
    return a.cpuPct === b.cpuPct &&
      a.ramPct === b.ramPct &&
      a.netUp === b.netUp &&
      a.netDown === b.netDown &&
      a.online === b.online;
  }
  return (
    a.uuid === b.uuid &&
    a.name === b.name &&
    a.group === b.group &&
    a.region === b.region &&
    a.hidden === b.hidden &&
    a.cpu_name === b.cpu_name &&
    a.cpu_cores === b.cpu_cores &&
    a.arch === b.arch &&
    a.virtualization === b.virtualization &&
    a.os === b.os &&
    a.kernel_version === b.kernel_version &&
    a.gpu_name === b.gpu_name &&
    a.mem_total === b.mem_total &&
    a.swap_total === b.swap_total &&
    a.disk_total === b.disk_total &&
    a.weight === b.weight &&
    a.price === b.price &&
    a.billing_cycle === b.billing_cycle &&
    a.auto_renewal === b.auto_renewal &&
    a.currency === b.currency &&
    a.expired_at === b.expired_at &&
    a.tags === b.tags &&
    a.public_remark === b.public_remark &&
    a.traffic_limit === b.traffic_limit &&
    a.traffic_limit_type === b.traffic_limit_type &&
    a.created_at === b.created_at &&
    a.updated_at === b.updated_at &&
    a.online === b.online &&
    a.cpuPct === b.cpuPct &&
    a.ramUsed === b.ramUsed &&
    a.ramTotal === b.ramTotal &&
    a.ramPct === b.ramPct &&
    a.swapUsed === b.swapUsed &&
    a.swapTotal === b.swapTotal &&
    a.swapPct === b.swapPct &&
    a.diskUsed === b.diskUsed &&
    a.diskTotal === b.diskTotal &&
    a.diskPct === b.diskPct &&
    a.netUp === b.netUp &&
    a.netDown === b.netDown &&
    a.trafficUp === b.trafficUp &&
    a.trafficDown === b.trafficDown &&
    a.uptime === b.uptime &&
    a.load1 === b.load1 &&
    a.load5 === b.load5 &&
    a.load15 === b.load15 &&
    a.process === b.process &&
    a.connectionsTcp === b.connectionsTcp &&
    a.connectionsUdp === b.connectionsUdp &&
    a.updatedAt === b.updatedAt
  );
}

export function mergeSparseMetadata(prev: NodeDisplay, next: NodeDisplay): NodeDisplay {
  return {
    ...prev,
    ...next,
    name: next.name || prev.name,
    region: next.region || prev.region,
    cpu_name: next.cpu_name || prev.cpu_name,
    cpu_cores: next.cpu_cores || prev.cpu_cores,
    arch: next.arch || prev.arch,
    virtualization: next.virtualization || prev.virtualization,
    os: next.os || prev.os,
    kernel_version: next.kernel_version || prev.kernel_version,
    gpu_name: next.gpu_name || prev.gpu_name,
    mem_total: next.mem_total || prev.mem_total,
    swap_total: next.swap_total || prev.swap_total,
    disk_total: next.disk_total || prev.disk_total,
    billing_cycle: next.billing_cycle || prev.billing_cycle,
    currency: next.currency || prev.currency,
    expired_at: next.expired_at || prev.expired_at,
    tags: next.tags || prev.tags,
    public_remark: next.public_remark || prev.public_remark,
    traffic_limit: next.traffic_limit || prev.traffic_limit,
    traffic_limit_type: next.traffic_limit_type || prev.traffic_limit_type,
    created_at: next.created_at || prev.created_at,
  };
}

export function materializeTrafficTrendSnapshot(
  buffer: TrafficTrendSample[],
  start: number,
  size: number,
): TrafficTrendSample[] {
  if (size <= 0) return EMPTY_TRAFFIC_TREND_SNAPSHOT;

  const snapshot = new Array<TrafficTrendSample>(TRAFFIC_TREND_SAMPLE_COUNT);
  const padding = TRAFFIC_TREND_SAMPLE_COUNT - size;

  for (let i = 0; i < padding; i++) {
    snapshot[i] = EMPTY_TRAFFIC_TREND_SAMPLE;
  }

  for (let i = 0; i < size; i++) {
    snapshot[padding + i] = buffer[(start + i) % TRAFFIC_TREND_SAMPLE_COUNT]!;
  }

  return snapshot;
}

export function updateTrafficTrendSeries(
  prevSeries: TrafficTrendSeries,
  value: number,
  updatedAt: number,
  online: boolean,
) {
  if (!online) {
    if (!prevSeries.signature && prevSeries.size === 0) {
      return { series: prevSeries, changed: false };
    }
    return { series: EMPTY_TRAFFIC_TREND_SERIES, changed: true };
  }

  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;
  const signature = `${updatedAt || 0}:${safeValue}`;
  if (signature === prevSeries.signature) {
    return { series: prevSeries, changed: false };
  }

  let visibleMax = safeValue > 0 ? safeValue : 1;
  for (let i = 0; i < prevSeries.size; i++) {
    const sample = prevSeries.buffer[(prevSeries.start + i) % TRAFFIC_TREND_SAMPLE_COUNT];
    if (sample && sample.value > visibleMax) {
      visibleMax = sample.value;
    }
  }

  const level = safeValue > 0 ? Math.max(0.2, Math.min(1, safeValue / visibleMax)) : 0.25;
  const nextSample: TrafficTrendSample = {
    value: safeValue,
    level,
    opacity: safeValue > 0 ? 0.4 + level * 0.48 : 0.52,
  };

  const buffer =
    prevSeries.buffer.length === TRAFFIC_TREND_SAMPLE_COUNT
      ? prevSeries.buffer
      : new Array<TrafficTrendSample>(TRAFFIC_TREND_SAMPLE_COUNT);
  const nextSize =
    prevSeries.size < TRAFFIC_TREND_SAMPLE_COUNT
      ? prevSeries.size + 1
      : TRAFFIC_TREND_SAMPLE_COUNT;
  const nextStart =
    prevSeries.size < TRAFFIC_TREND_SAMPLE_COUNT
      ? prevSeries.start
      : (prevSeries.start + 1) % TRAFFIC_TREND_SAMPLE_COUNT;
  const insertIndex =
    prevSeries.size < TRAFFIC_TREND_SAMPLE_COUNT
      ? (prevSeries.start + prevSeries.size) % TRAFFIC_TREND_SAMPLE_COUNT
      : prevSeries.start;

  if (prevSeries.size > 0 && buffer !== prevSeries.buffer) {
    for (let i = 0; i < prevSeries.size; i++) {
      buffer[(prevSeries.start + i) % TRAFFIC_TREND_SAMPLE_COUNT] =
        prevSeries.buffer[(prevSeries.start + i) % TRAFFIC_TREND_SAMPLE_COUNT]!;
    }
  }

  buffer[insertIndex] = nextSample;

  return {
    series: {
      buffer,
      start: nextStart,
      size: nextSize,
      signature,
      snapshot: materializeTrafficTrendSnapshot(buffer, nextStart, nextSize),
    },
    changed: true,
  };
}

export function sortDisplays(displays: NodeDisplay[]): NodeDisplay[] {
  return [...displays].sort((left, right) => {
    if (left.weight !== right.weight) return left.weight - right.weight;
    return left.uuid.localeCompare(right.uuid, undefined, { numeric: true });
  });
}
