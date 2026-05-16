import type { NodeDisplay } from "../types/monitor";
import type { WorkerDeltaOutput, WorkerSnapshotInput } from "./wsWorkerProtocol";
import {
  type NodeTrafficTrend,
  EMPTY_TRAFFIC_TREND,
  shallowEqualDisplay,
  mergeSparseMetadata,
  updateTrafficTrendSeries,
  sortDisplays,
} from "./wsShared";
import {
  mapStreamServerToNodeDisplay,
  rememberNodeDisplay,
  toTimestamp,
} from "./api/utils";

let byUuid: Record<string, NodeDisplay> = {};
let trafficTrends: Record<string, NodeTrafficTrend> = {};
let order: string[] = [];

function processSnapshot(input: WorkerSnapshotInput): WorkerDeltaOutput {
  const nowMs = toTimestamp(input.now);
  const displays = sortDisplays(
    input.servers.map((server) => mapStreamServerToNodeDisplay(server, nowMs)),
  );

  const nextByUuid: Record<string, NodeDisplay> = {};
  const nextTrafficTrends: Record<string, NodeTrafficTrend> = {};
  const changedNodes: WorkerDeltaOutput["changedNodes"] = [];
  const addedUuids: string[] = [];
  const removedUuids: string[] = [];

  for (const display of displays) {
    rememberNodeDisplay(display);

    const prev = byUuid[display.uuid];
    const merged = prev ? mergeSparseMetadata(prev, display) : display;
    nextByUuid[display.uuid] = merged;
    nextTrafficTrends[display.uuid] = trafficTrends[display.uuid] ?? EMPTY_TRAFFIC_TREND;

    if (!prev) {
      addedUuids.push(display.uuid);
    }

    const displayChanged = !prev || !shallowEqualDisplay(prev, merged);

    const prevTrend = trafficTrends[display.uuid] ?? EMPTY_TRAFFIC_TREND;
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
    }

    const trendChanged = nextUp.changed || nextDown.changed;

    if (displayChanged || trendChanged) {
      const trend = nextTrafficTrends[display.uuid];
      changedNodes.push({
        uuid: display.uuid,
        display: merged,
        trendSnapshot: trend.snapshot,
      });
    }
  }

  const nextOrder = displays.map((d) => d.uuid);

  for (const uuid of order) {
    if (!(uuid in nextByUuid)) {
      removedUuids.push(uuid);
    }
  }

  byUuid = nextByUuid;
  trafficTrends = nextTrafficTrends;
  order = nextOrder;

  return {
    type: "delta",
    changedNodes,
    addedUuids,
    removedUuids,
    order: nextOrder,
  };
}

self.onmessage = (event: MessageEvent<WorkerSnapshotInput>) => {
  const input = event.data;
  if (input.type === "snapshot") {
    const output = processSnapshot(input);
    self.postMessage(output);
  }
};
