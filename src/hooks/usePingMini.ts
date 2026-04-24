import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  ensurePingOverviewStarted,
  getPingSnapshot,
  subscribeToPingItem,
} from "@/services/pingOverviewStore";
import {
  getHomepagePingScopeSnapshot,
  setHomepagePingActive,
  subscribeHomepagePingScope,
} from "@/services/homepagePingScope";
import type { PingOverviewBucket, PingOverviewItem } from "@/types/monitor";

const MAX_VISIBLE_HOMEPAGE_PING_BUCKETS = 24;

const EMPTY_PING: PingOverviewItem = {
  client: "",
  isAssigned: false,
  lastValue: null,
  values: [],
  samples: [],
  max: 1,
  loss: null,
};

export function useHomepagePingOverview() {
  const activeUuids = useSyncExternalStore(
    subscribeHomepagePingScope,
    getHomepagePingScopeSnapshot,
    getHomepagePingScopeSnapshot,
  );

  useEffect(() => {
    ensurePingOverviewStarted(activeUuids);
  }, [activeUuids]);
}

export function useHomepagePingRegistration(uuid: string, active: boolean) {
  useEffect(() => {
    if (!uuid) return;
    setHomepagePingActive(uuid, active);
    return () => {
      setHomepagePingActive(uuid, false);
    };
  }, [active, uuid]);
}

export function usePingMini(uuid: string, enabled = true): PingOverviewItem {
  return useSyncExternalStore(
    uuid && enabled ? (cb) => subscribeToPingItem(uuid, cb) : () => () => undefined,
    uuid && enabled ? () => getPingSnapshot(uuid) : () => EMPTY_PING,
    uuid && enabled ? () => getPingSnapshot(uuid) : () => EMPTY_PING,
  );
}

export function usePingMiniBuckets(
  ping: Pick<PingOverviewItem, "samples">,
  count?: number,
  enabled = true,
): PingOverviewBucket[] {
  return useMemo(() => {
    if (!enabled) return [];

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
  }, [count, enabled, ping.samples]);
}
