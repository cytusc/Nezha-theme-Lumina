import { useEffect, useMemo, useState } from "react";
import { useNodeStoreStatus, useVisibleNodeUuids } from "@/hooks/useNode";
import { useHomepagePingOverview } from "@/hooks/usePingMini";
import { NodeCard } from "./NodeCard";

const INITIAL_RENDER_COUNT = 8;
const RENDER_BATCH_COUNT = 8;

function useProgressiveNodeUuids(uuids: string[]) {
  const [renderCount, setRenderCount] = useState(() => Math.min(uuids.length, INITIAL_RENDER_COUNT));

  useEffect(() => {
    const nextInitial = Math.min(uuids.length, INITIAL_RENDER_COUNT);
    setRenderCount(nextInitial);
    if (uuids.length <= nextInitial) return;

    let cancelled = false;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let timer: number | null = null;
    let idleHandle: number | null = null;
    let scheduled = false;

    const flush = () => {
      if (cancelled) return;
      scheduled = false;
      setRenderCount((current) => {
        if (current >= uuids.length) return current;
        const next = Math.min(uuids.length, current + RENDER_BATCH_COUNT);
        if (!cancelled && next < uuids.length) {
          schedule();
        }
        return next;
      });
    };

    const schedule = () => {
      if (scheduled || cancelled) return;
      scheduled = true;
      if (typeof idleWindow.requestIdleCallback === "function") {
        idleHandle = idleWindow.requestIdleCallback(flush, { timeout: 240 });
        return;
      }
      timer = window.setTimeout(flush, 32);
    };

    schedule();

    return () => {
      cancelled = true;
      if (idleHandle != null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [uuids]);

  return useMemo(
    () => ({
      rendered: uuids.slice(0, renderCount),
      remaining: Math.max(0, uuids.length - renderCount),
    }),
    [renderCount, uuids],
  );
}

export function NodeGrid() {
  const uuids = useVisibleNodeUuids();
  const { initialized } = useNodeStoreStatus();
  const { rendered, remaining } = useProgressiveNodeUuids(uuids);
  useHomepagePingOverview();

  if (!initialized) {
    return (
      <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
        <span className="text-[15px]">正在加载节点概览</span>
        <span className="text-[12px]">已启用 REST 首屏兜底，正在同步实时状态</span>
      </div>
    );
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
    <div
      className="grid gap-4 xl:gap-5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))" }}
    >
      {rendered.map((uuid) => (
        <div key={uuid}>
          <NodeCard uuid={uuid} />
        </div>
      ))}
      {remaining > 0 && (
        <div
          className="col-span-full flex items-center justify-center rounded-[18px] border border-[var(--border-subtle)] px-4 py-3 text-[12px] text-[var(--text-tertiary)]"
          style={{ background: "color-mix(in srgb, var(--surface) 86%, transparent)" }}
        >
          正在逐步挂载其余 {remaining} 个节点，优先保证首屏交互流畅
        </div>
      )}
    </div>
  );
}
