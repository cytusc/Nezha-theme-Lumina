import type { NodeDisplay, TrafficTrendSample } from "@/types/monitor";
import type { NezhaStreamServer } from "@/services/api";
import {
  parseServerStreamPayload,
  mapStreamServerToNodeDisplay,
  rememberNodeDisplay,
  getServerStreamUrl,
} from "@/services/api";
import { wsManager } from "@/services/api/core/wsManager";
import type { WorkerOutput } from "./wsWorkerProtocol";
import {
  type NodeTrafficTrend,
  EMPTY_TRAFFIC_TREND_SERIES,
  EMPTY_TRAFFIC_TREND,
  shallowEqualDisplay,
  mergeSparseMetadata,
  updateTrafficTrendSeries,
  sortDisplays,
} from "./wsShared";

let wsWorker: Worker | null = null;
let useWorker = typeof Worker !== "undefined";

type Listener = () => void;

interface State {
  byUuid: Record<string, NodeDisplay>;
  trafficTrends: Record<string, NodeTrafficTrend>;
  order: string[];
  initialized: boolean;
  lastSuccessAt: number;
  failureStreak: number;
}

interface StoreStatusSnapshot {
  initialized: boolean;
  lastSuccessAt: number;
  failureStreak: number;
}

function emptyState(): State {
  return {
    byUuid: {},
    trafficTrends: {},
    order: [],
    initialized: false,
    lastSuccessAt: 0,
    failureStreak: 0,
  };
}

function toTimestamp(value: number | null | undefined) {
  if (!Number.isFinite(value) || !value) return Date.now();
  return value > 1_000_000_000_000 ? value : value * 1000;
}

let state: State = emptyState();
const globalListeners = new Set<Listener>();
const statusListeners = new Set<Listener>();
const nodeListeners = new Map<string, Set<Listener>>();
let visibleNodeUuidsSnapshot: string[] = [];
let statusSnapshot: StoreStatusSnapshot = {
  initialized: false,
  lastSuccessAt: 0,
  failureStreak: 0,
};

function commit(next: State, touched: Iterable<string>) {
  const statusChanged =
    next.initialized !== state.initialized ||
    next.lastSuccessAt !== state.lastSuccessAt ||
    next.failureStreak !== state.failureStreak;

  state = next;
  for (const listener of globalListeners) listener();
  if (statusChanged) {
    statusSnapshot = {
      initialized: next.initialized,
      lastSuccessAt: next.lastSuccessAt,
      failureStreak: next.failureStreak,
    };
    for (const listener of statusListeners) listener();
  }
  for (const uuid of touched) {
    const listeners = nodeListeners.get(uuid);
    if (!listeners) continue;
    for (const listener of listeners) listener();
  }
}

function applyStreamSnapshot(payload: ReturnType<typeof parseServerStreamPayload>) {
  const nowMs = toTimestamp(payload.now);
  const displays = sortDisplays(
    payload.servers.map((server: NezhaStreamServer) => mapStreamServerToNodeDisplay(server, nowMs)),
  );
  const nextByUuid: Record<string, NodeDisplay> = {};
  const nextTrafficTrends: Record<string, NodeTrafficTrend> = {};
  const touched = new Set<string>();

  for (const display of displays) {
    rememberNodeDisplay(display);

    const prev = state.byUuid[display.uuid];
    const merged = prev ? mergeSparseMetadata(prev, display) : display;
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
      initialized: true,
      lastSuccessAt: Date.now(),
      failureStreak: 0,
    },
    orderChanged ? new Set([...touched, ...state.order, ...nextOrder]) : touched,
  );
}

function applyWorkerDelta(
  changedNodes: WorkerOutput["changedNodes"],
  removedUuids: string[],
  order: string[],
) {
  const nextByUuid = { ...state.byUuid };
  const nextTrafficTrends = { ...state.trafficTrends };
  const touched = new Set<string>();

  for (const { uuid, display, trendSnapshot } of changedNodes) {
    nextByUuid[uuid] = display;
    nextTrafficTrends[uuid] = {
      up: EMPTY_TRAFFIC_TREND_SERIES,
      down: EMPTY_TRAFFIC_TREND_SERIES,
      snapshot: trendSnapshot,
    };
    touched.add(uuid);
  }

  for (const uuid of removedUuids) {
    delete nextByUuid[uuid];
    delete nextTrafficTrends[uuid];
    touched.add(uuid);
  }

  const orderChanged =
    order.length !== state.order.length ||
    order.some((uuid, index) => uuid !== state.order[index]);

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
      order,
      initialized: true,
      lastSuccessAt: Date.now(),
      failureStreak: 0,
    },
    orderChanged ? new Set([...touched, ...state.order, ...order]) : touched,
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

function handleWsMessage(data: unknown) {
  try {
    const payload = parseServerStreamPayload(data);
    if (useWorker && wsWorker) {
      wsWorker.postMessage({
        type: "snapshot",
        servers: payload.servers,
        now: payload.now,
      });
    } else {
      applyStreamSnapshot(payload);
    }
  } catch {
    // Ignore malformed frames and keep the last successful snapshot.
  }
}

function handleWsClose() {
  markConnectionFailure();
}

export function ensureStarted() {
  if (started) return;
  started = true;

  if (useWorker && !wsWorker) {
    try {
      wsWorker = new Worker(
        new URL("./wsWorker.ts", import.meta.url),
        { type: "module" },
      );
      wsWorker.onmessage = (event: MessageEvent<WorkerOutput>) => {
        const { changedNodes, removedUuids, order } = event.data;
        applyWorkerDelta(changedNodes, removedUuids, order);
      };
      wsWorker.onerror = () => {
        useWorker = false;
        wsWorker = null;
      };
    } catch {
      useWorker = false;
      wsWorker = null;
    }
  }

  wsManager.onMessage(handleWsMessage);
  wsManager.onClose(handleWsClose);
  wsManager.connect(getServerStreamUrl());
}

export function hydrateServerSnapshot(
  payload: ReturnType<typeof parseServerStreamPayload>,
) {
  if (state.initialized && state.lastSuccessAt > 0) return;
  applyStreamSnapshot(payload);
}

export function subscribe(listener: Listener): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

export function subscribeToStatus(listener: Listener): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
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

export function getStatusSnapshot(): StoreStatusSnapshot {
  return statusSnapshot;
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

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (wsWorker) {
      wsWorker.terminate();
      wsWorker = null;
    }
  });
}
