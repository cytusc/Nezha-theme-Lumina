import { lossHeatColor } from "@/utils/metricTone";
import type { PingOverviewBucket } from "@/types/komari";

const ACTIVE_BAR_HEIGHT = 0.84;

interface QualityBarsProps {
  value: number | null | undefined;
  count?: number;
  buckets?: PingOverviewBucket[];
  onHoverIndex?: (index: number | null) => void;
}

export function QualityBars({
  value,
  count,
  buckets,
  onHoverIndex,
}: QualityBarsProps) {
  const hasValue = value != null && Number.isFinite(value);
  const fallbackTone = hasValue ? lossHeatColor(value) : "var(--progress-bg)";
  const resolvedCount = count ?? Math.max(1, buckets?.length ?? 24);
  const bars = Array.from({ length: resolvedCount }, (_, index) => {
    const bucket = buckets?.[index] ?? null;
    const bucketLoss = bucket?.loss;
    const hasBucketValue =
      bucketLoss != null &&
      Number.isFinite(bucketLoss) &&
      (bucket?.total ?? 0) > 0;
    const loss = hasBucketValue ? bucketLoss : null;
    const active = hasBucketValue || (!buckets?.length && hasValue);
    const tone = hasBucketValue ? lossHeatColor(loss) : fallbackTone;

    return {
      active,
      bucket,
      tone,
    };
  });

  return (
    <div
      className="mini-bar-row"
      style={{ gap: bars.length > 48 ? 1 : 2 }}
      aria-hidden
      onMouseLeave={() => onHoverIndex?.(null)}
    >
      {bars.map(({ active, bucket, tone }, index) => {
        return (
          <span
            key={index}
            onMouseEnter={() => onHoverIndex?.(bucket?.index ?? (active ? index : null))}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              height: `${Math.round(ACTIVE_BAR_HEIGHT * 100)}%`,
              background: active ? tone : "var(--progress-bg)",
              opacity: active ? 0.94 : 0.42,
              borderRadius: 2,
              alignSelf: "flex-end",
            }}
          />
        );
      })}
    </div>
  );
}
