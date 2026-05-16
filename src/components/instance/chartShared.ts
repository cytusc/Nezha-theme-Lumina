import { useEffect, useState, type RefObject } from "react";
import type uPlot from "uplot";
import { formatTrafficRateLabel } from "@/utils/format";

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

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function formatTimeAxisLabel(value: number, hours: number, compact: boolean) {
  const date = new Date(value * 1000);
  const monthDay = `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const monthDayCompact = `${date.getMonth() + 1}/${date.getDate()}`;
  const hourMinute = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

  if (hours >= 720) return compact ? monthDayCompact : monthDay;
  if (hours >= 168) return compact ? monthDay : `${monthDay} ${hourMinute}`;
  return hourMinute;
}

export function createTimeAxisValuesFormatter(hours: number, chartWidth?: number) {
  const compact =
    typeof chartWidth === "number" && Number.isFinite(chartWidth) && chartWidth > 0
      ? chartWidth < 420
      : false;
  return (_self: uPlot, splits: number[]): string[] => {
    return splits.map((value) => formatTimeAxisLabel(value, hours, compact));
  };
}

export function formatTooltipTime(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export type ChartAxisKind = "default" | "percent" | "network" | "count";

export interface ChartAxisConfig {
  kind?: ChartAxisKind;
  unit?: string;
  minSize?: number;
  hideZero?: boolean;
}

export interface ChartValueRange {
  min: number;
  max: number;
}

export function estimateAxisTextSize(label: string, minSize = 54) {
  return Math.max(minSize, label.length * 8 + 10);
}

function resolveAxisConfig(config?: ChartAxisConfig) {
  return {
    kind: config?.kind ?? "default",
    unit: config?.unit ?? "",
    minSize: config?.minSize ?? 54,
    hideZero: config?.hideZero ?? config?.kind !== "percent",
  } as const;
}

function formatPercentAxisValue(value: number, min: number, max: number) {
  const span = Math.abs(max - min);
  if (span < 0.5) return `${value.toFixed(2)}%`;
  if (span < 5) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

function formatNetworkAxisValue(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return formatTrafficRateLabel(value);
}

function formatCountAxisValue(value: number, min: number, max: number) {
  const span = Math.abs(max - min);
  if (span < 10) return value.toFixed(1);
  return `${Math.round(value)}`;
}

export function formatChartAxisValue(
  value: number,
  range: ChartValueRange,
  config?: ChartAxisConfig,
) {
  const resolved = resolveAxisConfig(config);
  if (!Number.isFinite(value)) return "";
  if (resolved.hideZero && value === 0) return "";
  if (resolved.kind === "network") return formatNetworkAxisValue(value);
  if (resolved.kind === "percent") return formatPercentAxisValue(value, range.min, range.max);
  if (resolved.kind === "count") return formatCountAxisValue(value, range.min, range.max);
  return `${Math.round(value)}${resolved.unit}`;
}

export function formatChartTooltipValue(
  value: number | null | undefined,
  range: ChartValueRange,
  config?: ChartAxisConfig,
) {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatChartAxisValue(value, range, {
    ...config,
    hideZero: false,
  });
}

export function createChartAxisValuesFormatter(config?: ChartAxisConfig) {
  return (_self: uPlot, splits: number[]) => {
    const min = Number(_self.scales.y.min ?? 0);
    const max = Number(_self.scales.y.max ?? 0);
    return splits.map((value) => formatChartAxisValue(value, { min, max }, config));
  };
}

export function getChartValueRange(values: Array<number | null | undefined>): ChartValueRange | null {
  const numericValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (numericValues.length === 0) return null;
  return {
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
  };
}

export function estimateChartAxisSize(
  values: Array<number | null | undefined>,
  config?: ChartAxisConfig,
) {
  const resolved = resolveAxisConfig(config);
  const range = getChartValueRange(values);
  if (!range) return resolved.minSize;
  const label = formatChartAxisValue(range.max, range, { ...resolved, hideZero: false });
  return estimateAxisTextSize(label, resolved.minSize);
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
