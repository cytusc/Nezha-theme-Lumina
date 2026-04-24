import { getHomeBootstrap } from "@/services/api";
import { seedPingOverview } from "@/services/pingOverviewStore";
import { hydrateServerSnapshot } from "@/services/wsStore";

let bootstrapPromise: Promise<void> | null = null;
let bootstrapAttempted = false;

export function ensureHomeBootstrap() {
  if (bootstrapAttempted) {
    return bootstrapPromise ?? Promise.resolve();
  }

  bootstrapAttempted = true;
  bootstrapPromise = getHomeBootstrap()
    .then((payload) => {
      hydrateServerSnapshot(payload.snapshot);
      seedPingOverview(
        payload.ping_overviews,
        payload.snapshot.servers.map((server) => String(server.id)),
      );
    })
    .catch(() => {
      // 静默失败，继续依赖 WebSocket 首帧恢复页面。
    });

  return bootstrapPromise;
}

