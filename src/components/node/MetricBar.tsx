import type { ReactNode } from "react";

const METRIC_SEGMENT_COUNT = 18;
const METRIC_SEGMENT_INDICES = Array.from({ length: METRIC_SEGMENT_COUNT }, (_, index) => index);

interface MetricBarProps {
  icon: ReactNode;
  label: string;
  valueText: string;
  unit?: string;
  detailText?: string;
  fraction: number; // 0..1
  /** CSS paint for the filled portion — solid color or linear-gradient. */
  fill: string;
}

export function MetricBar({
  icon,
  label,
  valueText,
  unit,
  detailText,
  fraction,
  fill,
}: MetricBarProps) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const activeSegments = clamped * METRIC_SEGMENT_COUNT;

  return (
    <div className="metric-item">
      <div className="flex justify-between items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 text-[var(--text-secondary)] flex-shrink-0">
          <span>{icon}</span>
          <span className="text-[11px] font-medium tracking-[0.02em]">{label}</span>
        </div>
        <div className="tabular text-[13px] text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-right">
          <span className="font-semibold">{valueText}</span>
          {unit && (
            <span className="ml-[1px] text-[11px] text-[var(--text-tertiary)]">{unit}</span>
          )}
        </div>
      </div>
      <div
        className="metric-detail"
        title={detailText}
        data-empty={detailText ? "false" : "true"}
      >
        {detailText ?? "\u00A0"}
      </div>
      <div className="metric-track">
        {METRIC_SEGMENT_INDICES.map((index) => {
          const fillLevel = Math.max(0, Math.min(1, activeSegments - index));
          const isActive = fillLevel > 0;
          return (
            <span
              key={index}
              className="metric-segment"
              style={{
                opacity: isActive ? 0.42 + fillLevel * 0.56 : 0.58,
                ...(isActive
                  ? {
                      background: fill,
                      backgroundSize: `${METRIC_SEGMENT_COUNT * 100}% 100%`,
                      backgroundPosition: `${(index / Math.max(1, METRIC_SEGMENT_COUNT - 1)) * 100}% 50%`,
                    }
                  : {}),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
