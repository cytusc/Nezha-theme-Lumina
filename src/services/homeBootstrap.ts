import { getHomeBootstrap } from "@/services/api";
import { seedPingOverview } from "@/services/pingOverviewStore";
import { hydrateServerSnapshot } from "@/services/wsStore";

let bootstrapPromise: Promise<void> | null = null;
let bootstrapAttempted = false;
let bootstrapCacheHydrated = false;

const HOME_BOOTSTRAP_CACHE_KEY = "lumina.home-bootstrap.v1";

function hydrateFromBootstrapPayload(payload: Awaited<ReturnType<typeof getHomeBootstrap>>) {
  hydrateServerSnapshot(payload.snapshot);
  seedPingOverview(
    payload.ping_overviews,
    payload.snapshot.servers.map((server) => String(server.id)),
  );
}

function readCachedBootstrap() {
  if (bootstrapCacheHydrated || typeof window === "undefined") return null;
  bootstrapCacheHydrated = true;

  try {
    const raw = window.sessionStorage.getItem(HOME_BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Awaited<ReturnType<typeof getHomeBootstrap>>;
  } catch {
    return null;
  }
}

function writeCachedBootstrap(payload: Awaited<ReturnType<typeof getHomeBootstrap>>) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(HOME_BOOTSTRAP_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // 忽略浏览器缓存写入失败，避免影响实时流程。
  }
}

export function ensureHomeBootstrap() {
  const cached = readCachedBootstrap();
  if (cached) {
    hydrateFromBootstrapPayload(cached);
  }

  if (bootstrapAttempted) {
    return bootstrapPromise ?? Promise.resolve();
  }

  bootstrapAttempted = true;
  bootstrapPromise = getHomeBootstrap()
    .then((payload) => {
      hydrateFromBootstrapPayload(payload);
      writeCachedBootstrap(payload);
    })
    .catch(() => {
      // 静默失败，继续依赖 WebSocket 首帧恢复页面。
    });

  return bootstrapPromise;
}
