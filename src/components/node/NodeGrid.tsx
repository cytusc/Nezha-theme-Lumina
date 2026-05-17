import { useNodeStoreStatus, useVisibleNodeUuids } from "@/hooks/useNode";
import { useHomepagePingOverview } from "@/hooks/usePingMini";
import { NodeCard } from "./NodeCard";

function NodeGridSkeleton() {
  return (
    <div className="grid-scroll-container px-4 pb-12">
      <div
        className="grid gap-4 xl:gap-5 mx-auto w-full"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))",
        }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex justify-center">
            <div className="w-full max-w-[520px]">
              <div className="skeleton-card rounded-2xl h-[220px] animate-pulse" style={{ background: "var(--surface-card, rgba(128,128,128,0.06))" }}>
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full" style={{ background: "var(--progress-bg, rgba(128,128,128,0.12))" }} />
                    <div className="h-4 w-24 rounded" style={{ background: "var(--progress-bg, rgba(128,128,128,0.12))" }} />
                  </div>
                  <div className="h-3 w-full rounded" style={{ background: "var(--progress-bg, rgba(128,128,128,0.12))" }} />
                  <div className="h-3 w-3/4 rounded" style={{ background: "var(--progress-bg, rgba(128,128,128,0.12))" }} />
                  <div className="h-8 w-full rounded mt-4" style={{ background: "var(--progress-bg, rgba(128,128,128,0.12))" }} />
                  <div className="h-8 w-full rounded" style={{ background: "var(--progress-bg, rgba(128,128,128,0.12))" }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NodeGrid() {
  const uuids = useVisibleNodeUuids();
  const { initialized } = useNodeStoreStatus();
  useHomepagePingOverview();

  if (!initialized) {
    return <NodeGridSkeleton />;
  }

  if (uuids.length === 0) {
    return (
      <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
        <span className="text-[15px]">尚未连接到任何节点</span>
        <span className="text-[12px]">等待后端推送或前往管理后台添加</span>
      </div>
    );
  }

  return (
    <div className="grid-scroll-container px-4 pb-12">
      <div
        className="grid gap-4 xl:gap-5 mx-auto w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))"
        }}
      >
        {uuids.map((uuid) => (
          <div key={uuid} className="flex justify-center">
            <div className="w-full max-w-[520px]">
              <NodeCard uuid={uuid} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
