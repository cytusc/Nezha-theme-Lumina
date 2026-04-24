import { startTransition, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { InstanceDetails } from "@/components/instance/InstanceDetails";
import { PingChart } from "@/components/instance/PingChart";
import { LoadChart } from "@/components/instance/LoadChart";
import { buildLoadTimeRangeOptions } from "@/components/instance/chartShared";
import { useAuth } from "@/hooks/useAuth";

const FIXED_PING_HOURS = 24;
const GUEST_LOAD_HISTORY_HOURS = 24;
const MEMBER_LOAD_HISTORY_HOURS = 720;

export function Instance() {
  const { uuid } = useParams<{ uuid: string }>();
  const { data: me } = useAuth();
  const [chartType, setChartType] = useState<"load" | "ping">("load");
  const [loadHours, setLoadHours] = useState(0);
  const maxLoadHistoryHours = me?.logged_in
    ? MEMBER_LOAD_HISTORY_HOURS
    : GUEST_LOAD_HISTORY_HOURS;

  const loadRanges = useMemo(
    () => buildLoadTimeRangeOptions(maxLoadHistoryHours),
    [maxLoadHistoryHours],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [uuid]);

  useEffect(() => {
    if (!loadRanges.some((range) => range.value === loadHours)) {
      setLoadHours(loadRanges[0]?.value ?? 0);
    }
  }, [loadHours, loadRanges]);

  if (!uuid) return null;

  return (
    <div className="flex flex-col gap-5 py-2">
      <Link to="/" className="instance-page-back">
        <ChevronLeft size={14} />
        返回
      </Link>
      <InstanceDetails uuid={uuid} />
      <div className="instance-chart-controls">
        <div className="instance-segmented">
          <button
            type="button"
            data-active={chartType === "load" ? "true" : "false"}
            onClick={() => {
              startTransition(() => setChartType("load"));
            }}
          >
            负载
          </button>
          <button
            type="button"
            data-active={chartType === "ping" ? "true" : "false"}
            onClick={() => {
              startTransition(() => setChartType("ping"));
            }}
          >
            Ping
          </button>
        </div>
        {chartType === "load" && (
          <div key={`${chartType}-ranges`} className="instance-segmented is-scrollable">
            {loadRanges.map((range) => (
              <button
                key={range.value}
                type="button"
                data-active={loadHours === range.value ? "true" : "false"}
                onClick={() => {
                  startTransition(() => {
                    setLoadHours(range.value);
                  });
                }}
              >
                {range.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="instance-chart-stage">
        <div
          className="instance-chart-view"
          hidden={chartType !== "load"}
          aria-hidden={chartType !== "load"}
        >
          <LoadChart uuid={uuid} hours={loadHours} active={chartType === "load"} />
        </div>
        <div
          className="instance-chart-view"
          hidden={chartType !== "ping"}
          aria-hidden={chartType !== "ping"}
        >
          <PingChart uuid={uuid} hours={FIXED_PING_HOURS} active={chartType === "ping"} />
        </div>
      </div>
    </div>
  );
}
