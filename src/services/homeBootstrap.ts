import { getHomeBootstrap, getHomeSnapshot } from "@/services/api";
import { seedPingOverview } from "@/services/pingOverviewStore";
import { hydrateServerSnapshot } from "@/services/wsStore";
import {
  readBootstrapCache,
  writeBootstrapCache,
  readSnapshotCache,
  writeSnapshotCache,
  readPingCache,
  writePingCache,
} from "@/services/persistentCache";
let bootstrapPromise: Promise<void> | null = null;
let bootstrapAttempted = false;
let bootstrapCacheHydrated = false;

function hydrateFromBootstrapPayload(payload: Awaited<ReturnType<typeof getHomeBootstrap>>) {
  hydrateServerSnapshot(payload.snapshot);
  seedPingOverview(
    payload.ping_overviews,
    payload.snapshot.servers.map((server) => String(server.id)),
  );
}

function hydrateSnapshotOnly(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return;
  const data = snapshot as Record<string, unknown>;
  const snapshotData = data.snapshot;
  if (!snapshotData || typeof snapshotData !== "object") return;
  hydrateServerSnapshot(snapshotData as Parameters<typeof hydrateServerSnapshot>[0]);
}

async function readCachedBootstrap() {
  if (bootstrapCacheHydrated || typeof window === "undefined") return null;
  bootstrapCacheHydrated = true;

  try {
    const cached = await readBootstrapCache<Awaited<ReturnType<typeof getHomeBootstrap>>>();
    if (cached) return cached;

    const [snapshot, ping] = await Promise.all([
      readSnapshotCache(),
      readPingCache(),
    ]);
    if (snapshot && ping) {
      return { snapshot, ping_overviews: ping } as Awaited<ReturnType<typeof getHomeBootstrap>>;
    }

    if (snapshot) {
      hydrateSnapshotOnly(snapshot);
    }

    return null;
  } catch {
    return null;
  }
}

async function writeCachedBootstrap(payload: Awaited<ReturnType<typeof getHomeBootstrap>>) {
  await Promise.all([
    writeBootstrapCache(payload),
    writeSnapshotCache(payload.snapshot),
    writePingCache(payload.ping_overviews),
  ]);
}

async function tryFetchSnapshotFirst(): Promise<boolean> {
  try {
    const data = await getHomeSnapshot();
    if (data) {
      hydrateSnapshotOnly(data);
      return true;
    }
  } catch {
    // 轻量快照接口不可用，回退到完整 bootstrap
  }
  return false;
}

export function ensureHomeBootstrap() {
  let cachedSync: Awaited<ReturnType<typeof getHomeBootstrap>> | null = null;

  if (!bootstrapCacheHydrated && typeof window !== "undefined") {
    bootstrapCacheHydrated = true;
  }

  if (bootstrapAttempted) {
    return bootstrapPromise ?? Promise.resolve();
  }

  bootstrapAttempted = true;
  bootstrapPromise = (async () => {
    cachedSync = await readCachedBootstrap();
    if (cachedSync) {
      hydrateFromBootstrapPayload(cachedSync);
    } else {
      await tryFetchSnapshotFirst();
    }

    const payload = await getHomeBootstrap();
    hydrateFromBootstrapPayload(payload);
    await writeCachedBootstrap(payload);
  })().catch(() => {
    // 静默失败，继续依赖 WebSocket 首帧恢复页面。
  });

  return bootstrapPromise;
}
