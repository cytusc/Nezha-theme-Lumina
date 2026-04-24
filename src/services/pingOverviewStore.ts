import type { PingOverviewItem } from "@/types/monitor";
import { getHomepagePingOverviewBatch } from "@/services/api";

const DEFAULT_PING_REFRESH_INTERVAL = 30_000;
const PING_OVERVIEW_MISSING_GRACE_ROUNDS = 1;

type Listener = () => void;

interface PingOverviewStoreEntry {
  item: PingOverviewItem;
  missingRounds: number;
}

interface PingOverviewStoreState {
  visibleKey: string;
  items: Map<string, PingOverviewStoreEntry>;
}

const EMPTY_PING: PingOverviewItem = {
  client: "",
  isAssigned: false,
  lastValue: null,
  values: [],
  samples: [],
  max: 1,
  loss: null,
};

function normalizeVisibleUuids(uuids: string[]) {
  return Array.from(new Set(uuids.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}

function equalNumberArray(a: number[], b: number[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function equalSamples(
  a: Array<{ time: number; value: number }>,
  b: Array<{ time: number; value: number }>,
) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.time !== b[i]?.time || a[i]?.value !== b[i]?.value) return false;
  }
  return true;
}

function equalPingItem(a: PingOverviewItem | undefined, b: PingOverviewItem | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.client === b.client &&
    a.isAssigned === b.isAssigned &&
    a.lastValue === b.lastValue &&
    a.max === b.max &&
    a.loss === b.loss &&
    equalNumberArray(a.values, b.values) &&
    equalSamples(a.samples, b.samples)
  );
}

let pingOverviewState: PingOverviewStoreState = {
  visibleKey: "",
  items: new Map(),
};
let scheduledVisibleUuids: string[] = [];
let scheduledVisibleKey = "";
let pingRefreshInFlight = false;
let pingRefreshTimer: number | null = null;
let pingRefreshAbortController: AbortController | null = null;
const pingListeners = new Map<string, Set<Listener>>();

function schedulePingRefresh(intervalMs = DEFAULT_PING_REFRESH_INTERVAL) {
  if (pingRefreshTimer != null) {
    window.clearTimeout(pingRefreshTimer);
  }
  pingRefreshTimer = window.setTimeout(() => {
    pingRefreshTimer = null;
    void refreshPingOverview();
  }, intervalMs);
}

function commitPingOverview(visibleKey: string, items: Map<string, PingOverviewItem>) {
  const prevItems = pingOverviewState.items;
  const nextItems = new Map<string, PingOverviewStoreEntry>();
  const touched = new Set<string>();
  const keys = new Set<string>([...prevItems.keys(), ...items.keys()]);
  const preserveMissing = pingOverviewState.visibleKey === visibleKey;

  for (const key of keys) {
    const prevEntry = prevItems.get(key);
    const prev = prevEntry?.item;
    const next = items.get(key);

    if (!next) {
      if (
        preserveMissing &&
        prevEntry &&
        prevEntry.missingRounds < PING_OVERVIEW_MISSING_GRACE_ROUNDS
      ) {
        nextItems.set(key, {
          ...prevEntry,
          missingRounds: prevEntry.missingRounds + 1,
        });
        continue;
      }
      if (prevEntry) touched.add(key);
      continue;
    }

    if (equalPingItem(prev, next)) {
      nextItems.set(key, {
        item: prev ?? next,
        missingRounds: 0,
      });
      continue;
    }

    nextItems.set(key, {
      item: next,
      missingRounds: 0,
    });
    touched.add(key);
  }

  if (
    pingOverviewState.visibleKey === visibleKey &&
    touched.size === 0 &&
    nextItems.size === prevItems.size
  ) {
    return;
  }

  pingOverviewState = {
    visibleKey,
    items: nextItems,
  };

  for (const key of touched) {
    const listeners = pingListeners.get(key);
    if (!listeners) continue;
    for (const listener of listeners) listener();
  }
}

function toPingOverviewMap(items: Record<string, PingOverviewItem>) {
  return new Map<string, PingOverviewItem>(Object.entries(items));
}

async function buildOverviewMap(clientUuids: string[]) {
  pingRefreshAbortController?.abort();
  pingRefreshAbortController = new AbortController();
  const normalizedUuids = normalizeVisibleUuids(clientUuids);
  const items = await getHomepagePingOverviewBatch(normalizedUuids, {
    signal: pingRefreshAbortController.signal,
  });

  return {
    visibleKey: normalizedUuids.join("|"),
    items: toPingOverviewMap(items),
  };
}

async function refreshPingOverview() {
  if (pingRefreshInFlight) return;

  pingRefreshInFlight = true;
  const visibleKey = scheduledVisibleKey;

  try {
    if (scheduledVisibleUuids.length === 0) {
      pingRefreshAbortController?.abort();
      pingRefreshAbortController = null;
      return;
    }

    const next = await buildOverviewMap(scheduledVisibleUuids);
    if (visibleKey === scheduledVisibleKey) {
      commitPingOverview(next.visibleKey, next.items);
      schedulePingRefresh();
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    if (visibleKey === scheduledVisibleKey) {
      schedulePingRefresh();
    }
  } finally {
    pingRefreshInFlight = false;
    if (visibleKey !== scheduledVisibleKey) {
      void refreshPingOverview();
    }
  }
}

export function seedPingOverview(
  items: Record<string, PingOverviewItem>,
  visibleUuids: string[],
) {
  const normalizedVisibleUuids = normalizeVisibleUuids(visibleUuids);
  const visibleKey = normalizedVisibleUuids.join("|");
  commitPingOverview(visibleKey, toPingOverviewMap(items));
}

export function ensurePingOverviewStarted(visibleUuids: string[]) {
  const normalizedVisibleUuids = normalizeVisibleUuids(visibleUuids);
  const visibleKey = normalizedVisibleUuids.join("|");

  if (scheduledVisibleKey !== visibleKey) {
    scheduledVisibleUuids = normalizedVisibleUuids;
    scheduledVisibleKey = visibleKey;
    pingRefreshAbortController?.abort();
    pingRefreshAbortController = null;

    if (pingRefreshTimer != null) {
      window.clearTimeout(pingRefreshTimer);
      pingRefreshTimer = null;
    }
    void refreshPingOverview();
    return;
  }

  if (
    normalizedVisibleUuids.length > 0 &&
    !pingRefreshInFlight &&
    pingRefreshTimer == null &&
    pingOverviewState.items.size === 0
  ) {
    void refreshPingOverview();
  }
}

export function subscribeToPingItem(uuid: string, listener: Listener) {
  let listeners = pingListeners.get(uuid);
  if (!listeners) {
    listeners = new Set();
    pingListeners.set(uuid, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners?.delete(listener);
    if (listeners && listeners.size === 0) {
      pingListeners.delete(uuid);
    }
  };
}

export function getPingSnapshot(uuid: string) {
  return pingOverviewState.items.get(uuid)?.item ?? EMPTY_PING;
}
