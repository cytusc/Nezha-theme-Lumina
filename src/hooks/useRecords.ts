import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getLoadRecords, getPingRecords } from "@/services/api";
import { queryClient } from "@/services/queryClient";

const RECORD_STALE_TIME_MS = 30_000;

export function useLoadRecords(uuid: string, hours = 6, enabled = true) {
  return useQuery({
    queryKey: ["records", "load", uuid, hours],
    queryFn: () => getLoadRecords(uuid, hours),
    staleTime: RECORD_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: Boolean(uuid) && enabled,
  });
}

export function usePingRecords(uuid: string, hours = 6, enabled = true) {
  return useQuery({
    queryKey: ["records", "ping", uuid, hours],
    queryFn: () => getPingRecords(uuid, hours),
    staleTime: RECORD_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: Boolean(uuid) && enabled,
  });
}

export function prefetchLoadRecords(uuid: string, hours = 6) {
  if (!uuid) return Promise.resolve();
  return queryClient.prefetchQuery({
    queryKey: ["records", "load", uuid, hours],
    queryFn: () => getLoadRecords(uuid, hours),
    staleTime: RECORD_STALE_TIME_MS,
  });
}

export function prefetchPingRecords(uuid: string, hours = 6) {
  if (!uuid) return Promise.resolve();
  return queryClient.prefetchQuery({
    queryKey: ["records", "ping", uuid, hours],
    queryFn: () => getPingRecords(uuid, hours),
    staleTime: RECORD_STALE_TIME_MS,
  });
}
