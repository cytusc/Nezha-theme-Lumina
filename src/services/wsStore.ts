import type { NodeDisplay, TrafficTrendSample } from "@/types/monitor";
import {
  getServerStreamUrl,
  mapStreamServerToNodeDisplay,
  parseServerStreamPayload,
  rememberNodeDisplay,
} from "@/services/api";

type Listener = () => void;

interface State {
  byUuid: Record<string, NodeDisplay>;
  trafficTrends: Record<string, NodeTrafficTrend>;
  order: string[];
  lastSuccessAt: number;
  failureStreak: number;
}

interface TrafficTrendSeries {
  buffer: TrafficTrendSample[];
  start: number;
  size: number;
  signature: string;
  snapshot: TrafficTrendSample[];
}

interface NodeTrafficTrend {
  up: TrafficTrendSeries;
  down: TrafficTrendSeries;
  snapshot: {
    up: TrafficTrendSample[];
    down: TrafficTrendSample[];
  };
}

const TRAFFIC_TREND_SAMPLE_COUNT = 18;
const WS_RECONNECT_BASE_DELAY_MS = 2_000;
const WS_RECONNECT_MAX_DELAY_MS = 30_000;
const EMPTY_TRAFFIC_TREND_SAMPLE: TrafficTrendSample = {
  value: 0,
  level: 0.25,
  opacity: 0.52,
};
const EMPTY_TRAFFIC_TREND_SNAPSHOT = Array.from(
  { length: TRAFFIC_TREND_SAMPLE_COUNT },
  () => EMPTY_TRAFFIC_TREND_SAMPLE,
);
const EMPTY_TRAFFIC_TREND_SERIES: TrafficTrendSeries = {
  buffer: [],
  start: 0,
  size: 0,
  signature: "",
  snapshot: EMPTY_TRAFFIC_TREND_SNAPSHOT,
};
const EMPTY_NODE_TRAFFIC_TREND_SNAPSHOT = {
  up: EMPTY_TRAFFIC_TREND_SNAPSHOT,
  down: EMPTY_TRAFFIC_TREND_SNAPSHOT,
};
const EMPTY_TRAFFIC_TREND: NodeTrafficTrend = {
  up: EMPTY_TRAFFIC_TREND_SERIES,
  down: EMPTY_TRAFFIC_TREND_SERIES,
  snapshot: EMPTY_NODE_TRAFFIC_TREND_SNAPSHOT,
};

function emptyState(): State {
  return {
    byUuid: {},
    trafficTrends: {},
    order: [],
    lastSuccessAt: 0,
    failureStreak: 0,
  };
}

function toTimestamp(value: number | null | undefined) {
  if (!Number.isFinite(value) || !value) return Date.now();
  return value > 1_000_000_000_000 ? value : value * 1000;
}

function shallowEqualDisplay(a: NodeDisplay, b: NodeDisplay) {
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

function materializeTrafficTrendSnapshot(
  buffer: TrafficTrendSample[],
  start: number,
  size: number,
) {
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

function updateTrafficTrendSeries(
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

function sortDisplays(displays: NodeDisplay[]) {
  return [...displays].sort((left, right) => {
    if (left.weight !== right.weight) return left.weight - right.weight;
    return left.uuid.localeCompare(right.uuid, undefined, { numeric: true });
  });
}

let state: State = emptyState();
const globalListeners = new Set<Listener>();
const nodeListeners = new Map<string, Set<Listener>>();
let visibleNodeUuidsSnapshot: string[] = [];

function commit(next: State, touched: Iterable<string>) {
  state = next;
  for (const listener of globalListeners) listener();
  for (const uuid of touched) {
    const listeners = nodeListeners.get(uuid);
    if (!listeners) continue;
    for (const listener of listeners) listener();
  }
}

function applyStreamSnapshot(payload: ReturnType<typeof parseServerStreamPayload>) {
  const nowMs = toTimestamp(payload.now);
  const displays = sortDisplays(
    payload.servers.map((server) => mapStreamServerToNodeDisplay(server, nowMs)),
  );
  const nextByUuid: Record<string, NodeDisplay> = {};
  const nextTrafficTrends: Record<string, NodeTrafficTrend> = {};
  const touched = new Set<string>();

  for (const display of displays) {
    rememberNodeDisplay(display);

    const prev = state.byUuid[display.uuid];
    const merged = prev ? { ...prev, ...display } : display;
    nextByUuid[display.uuid] = merged;
    nextTrafficTrends[display.uuid] = state.trafficTrends[display.uuid] ?? EMPTY_TRAFFIC_TREND;

    if (!prev || !shallowEqualDisplay(prev, merged)) {
      touched.add(display.uuid);
    }

    const prevTrend = state.trafficTrends[display.uuid] ?? EMPTY_TRAFFIC_TREND;
    const nextUp = updateTrafficTrendSeries(
      prevTrend.up,
      merged.netUp,
      merged.updatedAt,
      merged.online,
    );
    const nextDown = updateTrafficTrendSeries(
      prevTrend.down,
      merged.netDown,
      merged.updatedAt,
      merged.online,
    );

    if (nextUp.changed || nextDown.changed) {
      nextTrafficTrends[display.uuid] = {
        up: nextUp.series,
        down: nextDown.series,
        snapshot: {
          up: nextUp.series.snapshot,
          down: nextDown.series.snapshot,
        },
      };
      touched.add(display.uuid);
    }
  }

  const nextOrder = displays.map((display) => display.uuid);
  const orderChanged =
    nextOrder.length !== state.order.length ||
    nextOrder.some((uuid, index) => uuid !== state.order[index]);

  if (
    !orderChanged &&
    touched.size === 0 &&
    state.failureStreak === 0 &&
    state.lastSuccessAt > 0
  ) {
    return;
  }

  commit(
    {
      byUuid: nextByUuid,
      trafficTrends: nextTrafficTrends,
      order: nextOrder,
      lastSuccessAt: Date.now(),
      failureStreak: 0,
    },
    orderChanged ? new Set([...touched, ...state.order, ...nextOrder]) : touched,
  );
}

function markConnectionFailure() {
  commit(
    {
      ...state,
      failureStreak: state.failureStreak + 1,
    },
    [],
  );
}

let started = false;
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectDelayMs = WS_RECONNECT_BASE_DELAY_MS;

function clearReconnectTimer() {
  if (reconnectTimer != null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!started || reconnectTimer != null) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(
    WS_RECONNECT_MAX_DELAY_MS,
    Math.round(reconnectDelayMs * 1.6),
  );
}

function openSocket() {
  if (
    !started ||
    typeof window === "undefined" ||
    (socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))
  ) {
    return;
  }

  clearReconnectTimer();

  try {
    socket = new WebSocket(getServerStreamUrl());
  } catch {
    markConnectionFailure();
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    reconnectDelayMs = WS_RECONNECT_BASE_DELAY_MS;
  };

  socket.onmessage = (event) => {
    try {
      const payload = parseServerStreamPayload(JSON.parse(event.data) as unknown);
      applyStreamSnapshot(payload);
    } catch {
      // Ignore malformed frames and keep the last successful snapshot.
    }
  };

  socket.onerror = () => {
    socket?.close();
  };

  socket.onclose = () => {
    socket = null;
    markConnectionFailure();
    scheduleReconnect();
  };
}

export function ensureStarted() {
  if (started) return;
  started = true;
  openSocket();
}

export function subscribe(listener: Listener): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

export function subscribeToNode(uuid: string, listener: Listener): () => void {
  let listeners = nodeListeners.get(uuid);
  if (!listeners) {
    listeners = new Set();
    nodeListeners.set(uuid, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners?.delete(listener);
    if (listeners && listeners.size === 0) {
      nodeListeners.delete(uuid);
    }
  };
}

export function getSnapshot(): State {
  return state;
}

export function getNodeSnapshot(uuid: string): NodeDisplay | undefined {
  return state.byUuid[uuid];
}

export function getNodeTrafficTrendSnapshot(uuid: string): {
  up: TrafficTrendSample[];
  down: TrafficTrendSample[];
} {
  const trend = state.trafficTrends[uuid] ?? EMPTY_TRAFFIC_TREND;
  return trend.snapshot;
}

export function getVisibleNodeUuidsSnapshot(): string[] {
  const next = state.order.filter((uuid) => {
    const node = state.byUuid[uuid];
    return Boolean(node) && !node.hidden;
  });

  if (
    next.length === visibleNodeUuidsSnapshot.length &&
    next.every((uuid, index) => uuid === visibleNodeUuidsSnapshot[index])
  ) {
    return visibleNodeUuidsSnapshot;
  }

  visibleNodeUuidsSnapshot = next;
  return visibleNodeUuidsSnapshot;
}
