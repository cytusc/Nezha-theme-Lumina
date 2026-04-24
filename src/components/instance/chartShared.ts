import { useEffect, useState, type RefObject } from "react";
import type uPlot from "uplot";

export interface TimeRangeOption {
  label: string;
  value: number;
}

export const LOAD_TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { label: "实时", value: 0 },
  { label: "1 天", value: 24 },
  { label: "7 天", value: 168 },
  { label: "30 天", value: 720 },
];

export function buildLoadTimeRangeOptions(maxHours: number | null | undefined) {
  const safeMaxHours =
    Number.isFinite(maxHours) && maxHours && maxHours > 0 ? Math.floor(maxHours) : 24;
  return LOAD_TIME_RANGE_OPTIONS.filter(
    (option) => option.value === 0 || option.value <= safeMaxHours,
  );
}

const GRID_CHART_DEFAULT = { w: 420, h: 150 };
const GRID_CHART_DESKTOP_MAX_WIDTH = 480;
const GRID_CHART_TABLET_MAX_WIDTH = 560;
const GRID_CHART_DESKTOP_GUTTER = 180;
const GRID_CHART_TABLET_GUTTER = 100;
const GRID_CHART_MOBILE_GUTTER = 56;
const GRID_CHART_HEIGHT = 148;
const WIDE_CHART_MIN_WIDTH = 300;
const WIDE_CHART_MAX_WIDTH = 1280;
const WIDE_CHART_GUTTER = 96;
const WIDE_CHART_HEIGHT = 340;
const WIDE_CHART_TABLET_HEIGHT = 300;
const WIDE_CHART_MOBILE_HEIGHT = 260;

export function toChartSeconds(value: string | number): number {
  if (typeof value === "number") {
    return value > 1_000_000_000_000 ? value / 1000 : value;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed / 1000;
}

export function formatHourMinuteAxis(_self: uPlot, splits: number[]): string[] {
  return splits.map((value) => {
    const date = new Date(value * 1000);
    return `${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  });
}

export function formatTooltipTime(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getChartTooltipPosition({
  containerWidth,
  containerHeight,
  anchorX,
  anchorY,
  rowCount,
  estimatedWidth = 188,
}: {
  containerWidth: number;
  containerHeight: number;
  anchorX: number;
  anchorY: number;
  rowCount: number;
  estimatedWidth?: number;
}) {
  const margin = 10;
  const offsetX = 18;
  const offsetY = 16;
  const estimatedHeight = 34 + rowCount * 22;
  const maxLeft = Math.max(margin, containerWidth - estimatedWidth - margin);
  const maxTop = Math.max(margin, containerHeight - estimatedHeight - margin);

  let left =
    anchorX + estimatedWidth + offsetX <= containerWidth - margin
      ? anchorX + offsetX
      : anchorX - estimatedWidth - offsetX;
  left = clamp(left, margin, maxLeft);

  let top = anchorY - estimatedHeight - offsetY;
  if (top < margin) top = anchorY + offsetY;
  top = clamp(top, margin, maxTop);

  return { left, top };
}

export function useResponsiveChartSize(
  mode: "grid" | "wide",
  containerRef?: RefObject<HTMLElement | null>,
) {
  const [size, setSize] = useState(
    mode === "grid"
      ? GRID_CHART_DEFAULT
      : { w: WIDE_CHART_MAX_WIDTH, h: WIDE_CHART_HEIGHT },
  );

  useEffect(() => {
    function resolveContainerWidth() {
      const containerWidth = containerRef?.current?.clientWidth ?? 0;
      return Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : null;
    }

    function update() {
      const viewportWidth = window.innerWidth;
      const containerWidth = resolveContainerWidth();
      if (mode === "wide") {
        const height =
          viewportWidth < 720
            ? WIDE_CHART_MOBILE_HEIGHT
            : viewportWidth < 1024
              ? WIDE_CHART_TABLET_HEIGHT
              : WIDE_CHART_HEIGHT;
        const resolvedWidth = containerWidth ?? (viewportWidth - WIDE_CHART_GUTTER);
        setSize({
          w: Math.max(WIDE_CHART_MIN_WIDTH, Math.floor(resolvedWidth)),
          h: height,
        });
        return;
      }

      if (viewportWidth >= 1280) {
        setSize({
          w: Math.min(GRID_CHART_DESKTOP_MAX_WIDTH, (viewportWidth - GRID_CHART_DESKTOP_GUTTER) / 3),
          h: GRID_CHART_HEIGHT,
        });
        return;
      }

      if (viewportWidth >= 768) {
        setSize({
          w: Math.min(GRID_CHART_TABLET_MAX_WIDTH, (viewportWidth - GRID_CHART_TABLET_GUTTER) / 2),
          h: GRID_CHART_HEIGHT,
        });
        return;
      }

      setSize({
        w: Math.max(WIDE_CHART_MIN_WIDTH - 20, viewportWidth - GRID_CHART_MOBILE_GUTTER),
        h: 136,
      });
    }

    update();
    window.addEventListener("resize", update);

    if (containerRef?.current && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => update());
      observer.observe(containerRef.current);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", update);
      };
    }

    return () => window.removeEventListener("resize", update);
  }, [containerRef, mode]);

  return size;
}
