import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useVisibleNodeUuids } from "@/hooks/useNode";
import { getPrimaryServiceOverview } from "@/services/api";
import type { PingOverviewBucket, PingOverviewItem } from "@/types/monitor";

const DEFAULT_PING_REFRESH_INTERVAL = 30_000;
const MAX_VISIBLE_HOMEPAGE_PING_BUCKETS = 24;
const PING_OVERVIEW_MISSING_GRACE_ROUNDS = 1;

const EMPTY_PING: PingOverviewItem = {
  client: "",
  isAssigned: false,
  lastValue: null,
  values: [],
  samples: [],
  max: 1,
  loss: null,
};

type Listener = () => void;

interface PingOverviewStoreEntry {
  item: PingOverviewItem;
  missingRounds: number;
}

interface PingOverviewStoreState {
  visibleKey: string;
  items: Map<string, PingOverviewStoreEntry>;
}

function normalizeVisibleUuids(uuids: string[]) {
  return Array.from(new Set(uuids.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
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

async function buildOverviewMap(clientUuids: string[]) {
  const normalizedUuids = normalizeVisibleUuids(clientUuids);
  const results = await Promise.allSettled(
    normalizedUuids.map(async (uuid) => ({
      uuid,
      item: await getPrimaryServiceOverview(uuid),
    })),
  );

  const items = new Map<string, PingOverviewItem>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    items.set(result.value.uuid, result.value.item);
  }

  return {
    visibleKey: normalizedUuids.join("|"),
    items,
  };
}

let pingOverviewState: PingOverviewStoreState = {
  visibleKey: "",
  items: new Map(),
};
let scheduledVisibleUuids: string[] = [];
let scheduledVisibleKey = "";
let pingRefreshInFlight = false;
let pingRefreshTimer: number | null = null;
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

async function refreshPingOverview() {
  if (pingRefreshInFlight) return;

  pingRefreshInFlight = true;
  const visibleKey = scheduledVisibleKey;

  try {
    if (scheduledVisibleUuids.length === 0) {
      commitPingOverview("", new Map());
      return;
    }

    const next = await buildOverviewMap(scheduledVisibleUuids);
    if (visibleKey === scheduledVisibleKey) {
      commitPingOverview(next.visibleKey, next.items);
      schedulePingRefresh();
    }
  } catch {
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

function ensurePingOverviewStarted(visibleUuids: string[]) {
  const normalizedVisibleUuids = normalizeVisibleUuids(visibleUuids);
  const visibleKey = normalizedVisibleUuids.join("|");

  if (scheduledVisibleKey !== visibleKey) {
    scheduledVisibleUuids = normalizedVisibleUuids;
    scheduledVisibleKey = visibleKey;

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

function subscribeToPingItem(uuid: string, listener: Listener) {
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

function getPingSnapshot(uuid: string) {
  return pingOverviewState.items.get(uuid)?.item ?? EMPTY_PING;
}

export function useHomepagePingOverview() {
  const visibleUuids = useVisibleNodeUuids();

  useEffect(() => {
    ensurePingOverviewStarted(visibleUuids);
  }, [visibleUuids]);
}

export function usePingMini(uuid: string): PingOverviewItem {
  return useSyncExternalStore(
    uuid ? (cb) => subscribeToPingItem(uuid, cb) : () => () => undefined,
    uuid ? () => getPingSnapshot(uuid) : () => EMPTY_PING,
    uuid ? () => getPingSnapshot(uuid) : () => EMPTY_PING,
  );
}

export function usePingMiniBuckets(
  ping: Pick<PingOverviewItem, "samples">,
  count?: number,
): PingOverviewBucket[] {
  return useMemo(() => {
    const now = Date.now();
    const totalWindowMs = 60 * 60 * 1000;
    const resolvedCount = count ?? MAX_VISIBLE_HOMEPAGE_PING_BUCKETS;
    const bucketMs = totalWindowMs / resolvedCount;
    const windowStart = now - bucketMs * resolvedCount;
    const totals = new Array<number>(resolvedCount).fill(0);
    const losts = new Array<number>(resolvedCount).fill(0);
    const positiveSums = new Array<number>(resolvedCount).fill(0);
    const positiveCounts = new Array<number>(resolvedCount).fill(0);

    for (const sample of ping.samples ?? []) {
      if (sample.time < windowStart || sample.time > now) continue;

      let bucketIndex = Math.floor((sample.time - windowStart) / bucketMs);
      if (bucketIndex < 0) continue;
      if (bucketIndex >= resolvedCount) bucketIndex = resolvedCount - 1;

      totals[bucketIndex] += 1;
      if (sample.value > 0) {
        positiveSums[bucketIndex] += sample.value;
        positiveCounts[bucketIndex] += 1;
      } else {
        losts[bucketIndex] += 1;
      }
    }

    return Array.from({ length: resolvedCount }, (_, index) => {
      const startAt = windowStart + index * bucketMs;
      const endAt = startAt + bucketMs;
      const total = totals[index];
      const lost = losts[index];
      const positiveCount = positiveCounts[index];

      return {
        index,
        value: positiveCount > 0 ? positiveSums[index] / positiveCount : null,
        loss: total > 0 ? (lost / total) * 100 : null,
        total,
        lost,
        startAt,
        endAt,
      };
    });
  }, [count, ping.samples]);
}
