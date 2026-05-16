import { nezhaAdapter } from "./api/adapters/nezhaAdapter";
import {
  type NezhaStreamServer,
  type HomeBootstrapPayload,
} from "./api/schemas";
import {
  rememberNodeDisplay,
  parseServerStreamPayload,
  mapStreamServerToNodeDisplay,
  getServerStreamUrl,
} from "./api/utils";
import type {
  LoadRecordsResponse,
  Me,
  PingOverviewItem,
  PingRecordsResponse,
  Version,
} from "@/types/monitor";

export type { NezhaStreamServer, HomeBootstrapPayload };

export { rememberNodeDisplay, parseServerStreamPayload, mapStreamServerToNodeDisplay, getServerStreamUrl };

export async function getHomeSnapshot(options?: { signal?: AbortSignal }): Promise<unknown | null> {
  return await nezhaAdapter.getHomeSnapshot(options);
}

export async function getHomeBootstrap(): Promise<HomeBootstrapPayload> {
  return await nezhaAdapter.getHomeBootstrap();
}

export async function getHomepagePingOverviewBatch(
  uuids: string[],
  options?: { signal?: AbortSignal },
): Promise<Record<string, PingOverviewItem>> {
  return await nezhaAdapter.getHomepagePingOverviewBatch(uuids, options);
}

export async function getMe(): Promise<Me> {
  return await nezhaAdapter.getMe();
}

export async function getVersion(): Promise<Version> {
  return await nezhaAdapter.getVersion();
}

export async function getLoadRecords(
  uuid: string,
  hours?: number,
): Promise<LoadRecordsResponse> {
  return await nezhaAdapter.getLoadRecords(uuid, hours);
}

export async function getPingRecords(
  uuid: string,
  hours?: number,
): Promise<PingRecordsResponse> {
  return await nezhaAdapter.getPingRecords(uuid, hours);
}

export async function getPrimaryServiceOverview(uuid: string): Promise<PingOverviewItem> {
  return await nezhaAdapter.getPrimaryServiceOverview(uuid);
}

export { apiMonitor } from "./api/monitoring/apiMonitor";
export { apiLogger } from "./api/monitoring/apiLogger";
