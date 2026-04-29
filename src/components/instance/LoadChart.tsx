import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import UplotReact from "uplot-react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { ArrowDown, ArrowUp, Cpu, Gauge, HardDrive, MemoryStick, Network, Workflow } from "lucide-react";
import { useLoadRecords } from "@/hooks/useRecords";
import { useNode } from "@/hooks/useNode";
import { InstancePanel } from "./InstancePanel";
import {
  createChartAxisValuesFormatter,
  createTimeAxisValuesFormatter,
  formatChartTooltipValue,
  formatTooltipTime,
  getChartValueRange,
  getChartTooltipPosition,
  estimateChartAxisSize,
  toChartSeconds,
  type ChartAxisConfig,
  useResponsiveChartSize,
} from "./chartShared";
import {
  fillMissingMetricPoints,
  interpolateMetricGaps,
} from "./chartData";
import { formatBytes, formatTrafficRateLabel } from "@/utils/format";
import { usePreferences } from "@/hooks/usePreferences";

const CHART_COLORS = {
  cpu: "#5d88ff",
  memory: "#a35cf5",
  disk: "#f1873d",
  success: "#61c08f",
  warning: "#d4a54a",
} as const;

const REALTIME_HISTORY_SEED_LIMIT = 120;
const REALTIME_SAMPLE_LIMIT = 600;

const CPU_KEYS = ["cpu"];
const CPU_COLORS = [CHART_COLORS.cpu];
const MEMORY_KEYS = ["ram", "swap"];
const MEMORY_COLORS = [CHART_COLORS.memory, CHART_COLORS.warning];
const DISK_KEYS = ["disk"];
const DISK_COLORS = [CHART_COLORS.disk];
const NETWORK_KEYS = ["netIn", "netOut"];
const NETWORK_COLORS = [CHART_COLORS.success, CHART_COLORS.cpu];
const CONNECTION_KEYS = ["connections", "udp"];
const CONNECTION_COLORS = [CHART_COLORS.memory, CHART_COLORS.cpu];
const PROCESS_KEYS = ["process"];
const PROCESS_COLORS = [CHART_COLORS.warning];
const PERCENT_AXIS_CONFIG = { kind: "percent" } satisfies ChartAxisConfig;
const NETWORK_AXIS_CONFIG = { kind: "network" } satisfies ChartAxisConfig;
const COUNT_AXIS_CONFIG = { kind: "count" } satisfies ChartAxisConfig;
const LOAD_INTERPOLATE_KEYS = [
  "cpu",
  "ram",
  "swap",
  "disk",
  "diskBytes",
  "netIn",
  "netOut",
  "connections",
  "udp",
  "process",
  "load",
];

interface ChartPoint {
  time: number;
  [key: string]: number | null;
}

interface TooltipState {
  show: boolean;
  left: number;
  top: number;
  rows: Array<{ label: string; value: string; color: string }>;
  time: string;
}

function downsampleChartPoints(
  points: ChartPoint[],
  keys: string[],
  chartWidth: number,
) {
  const targetSamples = Math.max(180, Math.floor(chartWidth * 1.5));
  if (points.length <= targetSamples || keys.length === 0) return points;

  const maxPointsPerBucket = Math.max(2, 2 + keys.length * 2);
  const bucketCount = Math.max(1, Math.floor(targetSamples / maxPointsPerBucket));
  const bucketSize = Math.max(1, Math.ceil(points.length / bucketCount));
  const downsampled: ChartPoint[] = [];

  for (let start = 0; start < points.length; start += bucketSize) {
    const bucket = points.slice(start, Math.min(points.length, start + bucketSize));
    if (bucket.length === 0) continue;

    const selected = new Map<number, ChartPoint>();
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    selected.set(first.time, first);
    selected.set(last.time, last);

    for (const key of keys) {
      let minPoint: ChartPoint | null = null;
      let maxPoint: ChartPoint | null = null;
      let minValue = Number.POSITIVE_INFINITY;
      let maxValue = Number.NEGATIVE_INFINITY;

      for (const point of bucket) {
        const rawValue = point[key];
        if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) continue;
        if (rawValue <= minValue) {
          minValue = rawValue;
          minPoint = point;
        }
        if (rawValue >= maxValue) {
          maxValue = rawValue;
          maxPoint = point;
        }
      }

      if (minPoint) selected.set(minPoint.time, minPoint);
      if (maxPoint) selected.set(maxPoint.time, maxPoint);
    }

    const ordered = [...selected.values()].sort((left, right) => left.time - right.time);
    for (const point of ordered) {
      if (downsampled[downsampled.length - 1]?.time === point.time) continue;
      downsampled.push(point);
    }
  }

  return downsampled.length >= 2 ? downsampled : points;
}

function metricData(points: ChartPoint[], keys: string[]): uPlot.AlignedData {
  const times = points.map((point) => point.time);
  return [times, ...keys.map((key) => points.map((point) => point[key] ?? null))] as uPlot.AlignedData;
}

function pointFromNode(node: NonNullable<ReturnType<typeof useNode>>): ChartPoint {
  return {
    time: Date.now() / 1000,
    cpu: node.cpuPct,
    ram: node.ramTotal > 0 ? (node.ramUsed / node.ramTotal) * 100 : 0,
    swap: node.swapTotal > 0 ? (node.swapUsed / node.swapTotal) * 100 : 0,
    disk: node.diskTotal > 0 ? (node.diskUsed / node.diskTotal) * 100 : 0,
    diskBytes: node.diskUsed,
    netIn: node.netDown,
    netOut: node.netUp,
    connections: node.connectionsTcp,
    udp: node.connectionsUdp,
    process: node.process,
    load: node.load1,
  };
}

function useOptions({
  title,
  keys,
  colors,
  height,
  width,
  resolvedAppearance,
  spanGaps,
  axisConfig,
  timeAxisFormatter,
  axisSize = 52,
}: {
  title: string;
  keys: string[];
  colors: string[];
  height: number;
  width: number;
  resolvedAppearance: "light" | "dark";
  spanGaps?: boolean;
  axisConfig?: ChartAxisConfig;
  timeAxisFormatter: (_self: uPlot, splits: number[]) => string[];
  axisSize?: number;
}): uPlot.Options {
  const isDark = resolvedAppearance === "dark";
  const grid = isDark ? "rgba(255,255,255,0.065)" : "rgba(0,0,0,0.08)";
  const text = isDark ? "#a5a5aa" : "#52525b";

  return {
    width,
    height,
    padding: [8, 12, 10, 2],
    cursor: { drag: { x: true, y: false } },
    legend: { show: false },
    scales: { x: { time: true }, y: { auto: true } },
    axes: [
      {
        stroke: text,
        grid: { stroke: grid, width: 1 },
        ticks: { stroke: grid },
        size: 34,
        values: timeAxisFormatter,
      },
      {
        stroke: text,
        grid: { stroke: grid, width: 1 },
        ticks: { stroke: grid },
        size: axisSize,
        values: createChartAxisValuesFormatter(axisConfig),
      },
    ],
    series: [
      { label: "time" },
      ...keys.map((key, index) => ({
        label: key,
        stroke: colors[index] ?? colors[0],
        fill: index === 0 ? `${colors[index] ?? colors[0]}22` : undefined,
        width: 1.6,
        spanGaps: spanGaps ?? false,
        points: { show: false },
      })),
    ],
    hooks: {
      init: [
        (u) => {
          u.root.setAttribute("aria-label", title);
        },
      ],
    },
  };
}

const ChartCard = memo(function ChartCard({
  icon,
  title,
  value,
  note,
  points,
  keys,
  colors,
  width,
  height,
  resolvedAppearance,
  unit = "",
  spanGaps,
  axisConfig,
  timeAxisFormatter,
  axisSize,
}: {
  icon: ReactNode;
  title: string;
  value: ReactNode;
  note?: ReactNode;
  points: ChartPoint[];
  keys: string[];
  colors: string[];
  width: number;
  height: number;
  resolvedAppearance: "light" | "dark";
  unit?: string;
  spanGaps?: boolean;
  axisConfig?: ChartAxisConfig;
  timeAxisFormatter: (_self: uPlot, splits: number[]) => string[];
  axisSize?: number;
}) {
  const dataRef = useRef<uPlot.AlignedData>([[]]);
  const [tooltip, setTooltip] = useState<TooltipState>({
    show: false,
    left: 0,
    top: 0,
    rows: [],
    time: "",
  });
  const sampledPoints = useMemo(
    () => downsampleChartPoints(points, keys, width),
    [keys, points, width],
  );
  const data = useMemo(() => metricData(sampledPoints, keys), [sampledPoints, keys]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const effectiveAxisConfig = useMemo(
    () => axisConfig ?? (unit ? { unit } satisfies ChartAxisConfig : undefined),
    [axisConfig, unit],
  );
  const valueRange = useMemo(
    () => getChartValueRange(data.slice(1).flatMap((series) => series as Array<number | null | undefined>)),
    [data],
  );
  const resolvedAxisSize = useMemo(
    () =>
      axisSize ??
      estimateChartAxisSize(
        data.slice(1).flatMap((series) => series as Array<number | null | undefined>),
        effectiveAxisConfig,
      ),
    [axisSize, data, effectiveAxisConfig],
  );
  const options = useMemo(
    () =>
      useOptions({
        title,
        keys,
        colors,
        height,
        width,
        resolvedAppearance,
        spanGaps,
        axisConfig: effectiveAxisConfig,
        timeAxisFormatter,
        axisSize: resolvedAxisSize,
      }),
    [colors, effectiveAxisConfig, height, keys, resolvedAppearance, resolvedAxisSize, spanGaps, timeAxisFormatter, title, unit, width],
  );

  const enhancedOptions = useMemo<uPlot.Options>(() => ({
    ...options,
    hooks: {
      ...options.hooks,
      init: [
        ...(options.hooks?.init ?? []),
        (u) => {
          u.root.addEventListener("mouseleave", () => {
            setTooltip((prev) => ({ ...prev, show: false }));
          });
        },
      ],
      setCursor: [
        (u) => {
          const idx = u.cursor.idx;
          if (idx == null || idx < 0) {
            setTooltip((prev) => ({ ...prev, show: false }));
            return;
          }
          const currentData = dataRef.current;
          const timestamp = currentData[0]?.[idx];
          if (typeof timestamp !== "number") {
            setTooltip((prev) => ({ ...prev, show: false }));
            return;
          }
          const rows = keys.map((key, keyIndex) => {
            const value = currentData[keyIndex + 1]?.[idx] as number | null | undefined;
            return {
              label: key,
              value: valueRange ? formatChartTooltipValue(value, valueRange, effectiveAxisConfig) : "—",
              color: colors[keyIndex] ?? colors[0],
            };
          });
          const bbox = u.root.getBoundingClientRect();
          const anchorX = u.valToPos(timestamp, "x");
          const anchorY = typeof u.cursor.top === "number" ? u.cursor.top : bbox.height * 0.5;
          const position = getChartTooltipPosition({
            containerWidth: bbox.width,
            containerHeight: bbox.height,
            anchorX,
            anchorY,
            rowCount: rows.length,
            estimatedWidth: 176,
          });
          setTooltip({
            show: true,
            left: position.left,
            top: position.top,
            rows,
            time: formatTooltipTime(timestamp),
          });
        },
      ],
    },
  }), [colors, effectiveAxisConfig, keys, options, valueRange]);

  return (
    <div className="instance-chart-card">
      <header className="instance-chart-card-head">
        <div className="instance-panel-subhead">
          {icon}
          <span>{title}</span>
        </div>
        <div className="instance-series-stats">
          <span className="tabular">{value}</span>
          {note && <span className="tabular text-[var(--text-tertiary)]">{note}</span>}
        </div>
      </header>
      <div className="instance-uplot-wrap">
        <UplotReact options={enhancedOptions} data={data} />
        {tooltip.show && (
          <div
            className="instance-chart-tooltip"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            <div className="instance-chart-tooltip-time">{tooltip.time}</div>
            {tooltip.rows.map((row) => (
              <div key={row.label} className="instance-chart-tooltip-row">
                <span className="instance-chart-tooltip-dot" style={{ background: row.color }} />
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export function LoadChart({
  uuid,
  hours,
  active = true,
}: {
  uuid: string;
  hours: number;
  active?: boolean;
}) {
  const isRealtime = hours === 0;
  const queryHours = isRealtime ? 24 : hours;
  const node = useNode(uuid, active);
  const { data, isLoading } = useLoadRecords(uuid, queryHours, active && Boolean(node));
  const { resolvedAppearance } = usePreferences();
  const { w, h } = useResponsiveChartSize("grid");
  const timeAxisFormatter = useMemo(
    () => createTimeAxisValuesFormatter(queryHours, w),
    [queryHours, w],
  );
  const [realtimePoints, setRealtimePoints] = useState<ChartPoint[]>([]);
  const [connectNulls, setConnectNulls] = useState(false);
  const waitingForNode = active && !node;

  useEffect(() => {
    if (!active || !isRealtime || !node) return;
    const point = pointFromNode(node);
    setRealtimePoints((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.time - point.time) < 1) return prev;
      return [...prev, point].slice(-600);
    });
  }, [active, isRealtime, node]);

  useEffect(() => {
    setRealtimePoints([]);
  }, [hours, uuid]);

  const historyPoints = useMemo<ChartPoint[]>(() => {
    const records = [...(data?.records ?? [])];
    const rawPoints = records
      .map((record) => ({
        time: toChartSeconds(record.time),
        cpu: record.cpu,
        ram: record.ram_total > 0 ? (record.ram / record.ram_total) * 100 : 0,
        swap: record.swap_total > 0 ? (record.swap / record.swap_total) * 100 : 0,
        disk: record.disk_total > 0 ? (record.disk / record.disk_total) * 100 : 0,
        diskBytes: record.disk,
        netIn: record.net_in,
        netOut: record.net_out,
        connections: record.connections,
        udp: record.connections_udp,
        process: record.process,
        load: record.load,
      }))
      .filter((point) => point.time > 0)
      .sort((a, b) => a.time - b.time);
    const filled = fillMissingMetricPoints(rawPoints);
    return interpolateMetricGaps(filled, LOAD_INTERPOLATE_KEYS);
  }, [data]);

  const points = useMemo<ChartPoint[]>(() => {
    if (isRealtime) {
      const initial = historyPoints.slice(-REALTIME_HISTORY_SEED_LIMIT);
      const merged = [...initial, ...realtimePoints].sort((a, b) => a.time - b.time);
      const deduped = merged.filter((point, index, arr) => {
        const next = arr[index + 1];
        return !next || Math.abs(next.time - point.time) >= 1;
      });
      return deduped.slice(-REALTIME_SAMPLE_LIMIT);
    }
    return historyPoints;
  }, [historyPoints, isRealtime, realtimePoints]);

  if (waitingForNode || isLoading) {
    return <section className="instance-panel h-[260px] animate-pulse" aria-busy />;
  }

  if (!points.length) {
    return (
      <InstancePanel title="负载图表">
        <div className="instance-empty">暂无负载历史数据</div>
      </InstancePanel>
    );
  }

  return (
    <InstancePanel title="负载图表">
      <div className="instance-chart-toolbar">
        <button
          type="button"
          className="instance-toggle-button instance-switch-button"
          data-active={connectNulls ? "true" : "false"}
          onClick={() => setConnectNulls((value) => !value)}
          aria-pressed={connectNulls}
        >
          <span className="instance-switch-copy">断点连线</span>
          <span className="instance-switch-track" aria-hidden>
            <span className="instance-switch-thumb" />
          </span>
          <span className="instance-switch-state">
            {connectNulls ? "开启" : "关闭"}
          </span>
        </button>
      </div>
      <div className="instance-chart-grid">
        <ChartCard
          icon={<Cpu size={13} />}
          title="CPU"
          value={
            isRealtime && node
              ? `${node.cpuPct.toFixed(2)}%`
              : `${(points[points.length - 1]?.cpu ?? 0).toFixed(2)}%`
          }
          note="使用率"
          points={points}
          keys={CPU_KEYS}
          colors={CPU_COLORS}
          width={w}
          height={h}
          resolvedAppearance={resolvedAppearance}
          unit="%"
          spanGaps={connectNulls}
          axisConfig={PERCENT_AXIS_CONFIG}
          timeAxisFormatter={timeAxisFormatter}
        />
        <ChartCard
          icon={<MemoryStick size={13} />}
          title="内存"
          value={
            isRealtime && node
              ? `${formatBytes(node.ramUsed)} / ${formatBytes(node.ramTotal)}`
              : data?.records.length
                ? `${formatBytes(data.records[data.records.length - 1]?.ram ?? 0)} / ${formatBytes(data.records[data.records.length - 1]?.ram_total ?? 0)}`
                : "—"
          }
          note={
            isRealtime && node
              ? node.swapTotal
                ? `Swap ${formatBytes(node.swapUsed)} / ${formatBytes(node.swapTotal)}`
                : "Swap 无"
              : data?.records.length && (data.records[data.records.length - 1]?.swap_total ?? 0) > 0
                ? `Swap ${formatBytes(data.records[data.records.length - 1]?.swap ?? 0)} / ${formatBytes(data.records[data.records.length - 1]?.swap_total ?? 0)}`
                : "Swap 无"
          }
          points={points}
          keys={MEMORY_KEYS}
          colors={MEMORY_COLORS}
          width={w}
          height={h}
          resolvedAppearance={resolvedAppearance}
          unit="%"
          spanGaps={connectNulls}
          axisConfig={PERCENT_AXIS_CONFIG}
          timeAxisFormatter={timeAxisFormatter}
        />
        <ChartCard
          icon={<HardDrive size={13} />}
          title="磁盘"
          value={
            isRealtime && node
              ? `${formatBytes(node.diskUsed)} / ${formatBytes(node.diskTotal)}`
              : data?.records.length
                ? `${formatBytes(data.records[data.records.length - 1]?.disk ?? 0)} / ${formatBytes(data.records[data.records.length - 1]?.disk_total ?? 0)}`
                : "—"
          }
          note="已用空间"
          points={points}
          keys={DISK_KEYS}
          colors={DISK_COLORS}
          width={w}
          height={h}
          resolvedAppearance={resolvedAppearance}
          unit="%"
          spanGaps={connectNulls}
          axisConfig={PERCENT_AXIS_CONFIG}
          timeAxisFormatter={timeAxisFormatter}
        />
        <ChartCard
          icon={<Network size={13} />}
          title="网络"
          value={
            isRealtime && node
              ? `${formatTrafficRateLabel(node.netUp)} / ${formatTrafficRateLabel(node.netDown)}`
              : data?.records.length
                ? `${formatTrafficRateLabel(data.records[data.records.length - 1]?.net_out ?? 0)} / ${formatTrafficRateLabel(data.records[data.records.length - 1]?.net_in ?? 0)}`
                : "—"
          }
          note={
            <span className="instance-overview-multi">
              <span className="inline-flex items-center gap-1"><ArrowUp size={11} />{isRealtime && node ? formatBytes(node.trafficUp) : data?.records.length ? formatBytes(data.records[data.records.length - 1]?.net_total_up ?? 0) : "—"}</span>
              <span className="inline-flex items-center gap-1"><ArrowDown size={11} />{isRealtime && node ? formatBytes(node.trafficDown) : data?.records.length ? formatBytes(data.records[data.records.length - 1]?.net_total_down ?? 0) : "—"}</span>
            </span>
          }
          points={points}
          keys={NETWORK_KEYS}
          colors={NETWORK_COLORS}
          width={w}
          height={h}
          resolvedAppearance={resolvedAppearance}
          spanGaps={connectNulls}
          axisConfig={NETWORK_AXIS_CONFIG}
          timeAxisFormatter={timeAxisFormatter}
        />
        <ChartCard
          icon={<Workflow size={13} />}
          title="连接数"
          value={
            isRealtime && node
              ? `TCP ${node.connectionsTcp} / UDP ${node.connectionsUdp}`
              : data?.records.length
                ? `TCP ${Math.round(data.records[data.records.length - 1]?.connections ?? 0)} / UDP ${Math.round(data.records[data.records.length - 1]?.connections_udp ?? 0)}`
                : "—"
          }
          note="连接"
          points={points}
          keys={CONNECTION_KEYS}
          colors={CONNECTION_COLORS}
          width={w}
          height={h}
          resolvedAppearance={resolvedAppearance}
          spanGaps={connectNulls}
          axisConfig={COUNT_AXIS_CONFIG}
          timeAxisFormatter={timeAxisFormatter}
        />
        <ChartCard
          icon={<Gauge size={13} />}
          title="进程"
          value={
            isRealtime && node
              ? node.process.toString()
              : data?.records.length
                ? Math.round(data.records[data.records.length - 1]?.process ?? 0).toString()
                : "—"
          }
          note={
            isRealtime && node
              ? `负载 ${node.load1.toFixed(2)} | ${node.load5.toFixed(2)} | ${node.load15.toFixed(2)}`
              : data?.records.length
                ? `负载 ${(data.records[data.records.length - 1]?.load ?? 0).toFixed(2)}`
                : "—"
          }
          points={points}
          keys={PROCESS_KEYS}
          colors={PROCESS_COLORS}
          width={w}
          height={h}
          resolvedAppearance={resolvedAppearance}
          spanGaps={connectNulls}
          axisConfig={COUNT_AXIS_CONFIG}
          timeAxisFormatter={timeAxisFormatter}
        />
      </div>
    </InstancePanel>
  );
}
