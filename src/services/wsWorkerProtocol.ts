import type { NodeDisplay, TrafficTrendSample } from "@/types/monitor";

export interface WorkerSnapshotInput {
  type: "snapshot";
  servers: Array<{
    id: number;
    name: string;
    country_code: string;
    last_active: string | number | null;
    public_note: string;
    host: {
      cpu: string[];
      arch: string;
      virtualization: string;
      platform: string;
      platform_version: string;
      version: string;
      gpu: string[];
      mem_total: number;
      swap_total: number;
      disk_total: number;
    } | null;
    state: {
      cpu: number;
      mem_used: number;
      swap_used: number;
      disk_used: number;
      net_in_speed: number;
      net_out_speed: number;
      net_in_transfer: number;
      net_out_transfer: number;
      uptime: number;
      load_1: number;
      load_5: number;
      load_15: number;
      process_count: number;
      tcp_conn_count: number;
      udp_conn_count: number;
    } | null;
    display_index: number;
  }>;
  now: number;
}

export interface WorkerDeltaOutput {
  type: "delta";
  changedNodes: Array<{
    uuid: string;
    display: NodeDisplay;
    trendSnapshot: { up: TrafficTrendSample[]; down: TrafficTrendSample[] };
  }>;
  addedUuids: string[];
  removedUuids: string[];
  order: string[];
}

export type WorkerInput = WorkerSnapshotInput;
export type WorkerOutput = WorkerDeltaOutput;
