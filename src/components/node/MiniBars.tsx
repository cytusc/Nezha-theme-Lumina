import { latencyHeatColor } from "@/utils/metricTone";
import type { PingOverviewBucket } from "@/types/monitor";

interface MiniBarsProps {
  /** Raw latency values (ms) ordered oldest→newest. Values ≤0 are treated as lost and dimmed. */
  values: number[];
  /** Fallback denominator for 0..1 normalization. */
  max: number;
  /** Color tier threshold based on this value (fallback path only). */
  lastValue?: number;
  /** How many bars to render (pads older buckets with empty). */
  count?: number;
  buckets?: PingOverviewBucket[];
  onHoverIndex?: (index: number | null) => void;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? null;
  const weight = index - lower;
  return (sorted[lower] ?? 0) + ((sorted[upper] ?? 0) - (sorted[lower] ?? 0)) * weight;
}

/** Pixel-matched latency histogram (24 bars, 8px tall, 1px gap). */
export function MiniBars({
  values,
  max,
  lastValue,
  count = 24,
  buckets,
  onHoverIndex,
}: MiniBarsProps) {
  const bars: Array<{ value: number; bucket: PingOverviewBucket | null; hasSamples: boolean; tone: string }> =
    buckets && buckets.length > 0
      ? buckets.map((bucket) => {
          const value = bucket.value ?? 0;
          return {
            value,
            bucket,
            hasSamples: bucket.total > 0,
            tone: latencyHeatColor(bucket.value),
          };
        })
      : (() => {
          const fallbackTone = latencyHeatColor(lastValue);
          const nextBars: Array<{
            value: number;
            bucket: PingOverviewBucket | null;
            hasSamples: boolean;
            tone: string;
          }> = [];

          if (values.length === 0) {
            for (let i = 0; i < count; i++) {
              nextBars.push({
                value: 0,
                bucket: null,
                hasSamples: false,
                tone: fallbackTone,
              });
            }
            return nextBars;
          }

          if (values.length <= count) {
            const padding = count - values.length;
            for (let i = 0; i < padding; i++) {
              nextBars.push({
                value: 0,
                bucket: null,
                hasSamples: false,
                tone: fallbackTone,
              });
            }
            values.forEach((value) => {
              nextBars.push({
                value,
                bucket: null,
                hasSamples: true,
                tone: latencyHeatColor(value > 0 ? value : lastValue),
              });
            });
            return nextBars;
          }

          const bucketSize = values.length / count;
          for (let i = 0; i < count; i++) {
            const start = Math.floor(i * bucketSize);
            const end = Math.floor((i + 1) * bucketSize);
            const slice = values.slice(start, end);
            const positive = slice.filter((v) => v > 0);
            const avg = positive.length
              ? positive.reduce((a, b) => a + b, 0) / positive.length
              : 0;
            nextBars.push({
              value: avg,
              bucket: null,
              hasSamples: slice.length > 0,
              tone: latencyHeatColor(avg > 0 ? avg : lastValue),
            });
          }
          return nextBars;
        })();
  const positiveValues = bars
    .map((bar) => bar.value)
    .filter((value): value is number => Number.isFinite(value) && value > 0);
  const p95Cap = percentile(positiveValues, 0.95);
  const normalizedMax =
    p95Cap && Number.isFinite(p95Cap) && p95Cap > 0
      ? p95Cap
      : max > 0
        ? max
        : 1;

  return (
    <div
      className="mini-bar-row"
      style={{ gap: bars.length > 48 ? 1 : 2 }}
      onMouseLeave={() => onHoverIndex?.(null)}
    >
      {bars.map(({ value, bucket, hasSamples, tone }, i) => {
        const v = value;
        const has = v > 0;
        const h = has ? Math.max(0.2, Math.min(1, v / normalizedMax)) : 0.25;
        return (
          <span
            key={i}
            onMouseEnter={() => onHoverIndex?.(bucket?.index ?? (hasSamples ? i : null))}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              height: `${Math.round(h * 100)}%`,
              background: has ? tone : "var(--progress-bg)",
              opacity: has ? 0.92 : 0.55,
              borderRadius: 2,
              alignSelf: "flex-end",
            }}
          />
        );
      })}
    </div>
  );
}
