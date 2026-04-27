const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;
export type ExpireTone = "ok" | "warn" | "critical" | "long" | "none";
export type TrafficRateUnit = "B/s" | "KB/s" | "MB/s" | "GB/s" | "TB/s";

export interface TrafficRateDisplay {
  value: string;
  unit: TrafficRateUnit;
  bytesPerSec: number;
}

function trimFixed(value: number, digits: number): string {
  return value
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?[1-9])0+$/, "$1");
}

export function formatBytes(n: number | undefined | null, decimals = 2): string {
  if (!n || n < 0) return "0 B";
  let idx = 0;
  let v = n;
  while (v >= 1024 && idx < UNITS.length - 1) {
    v /= 1024;
    idx += 1;
  }
  if (idx === 0) return `${Math.round(v)} ${UNITS[idx]}`;
  const dec = v >= 100 ? 0 : v >= 10 ? 1 : decimals;
  return `${v.toFixed(dec)} ${UNITS[idx]}`;
}

function formatRateValue(value: number): string {
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return trimFixed(value, 1);
  if (value >= 1) return trimFixed(value, 2);
  return trimFixed(value, 3);
}

export function formatTrafficRate(bytesPerSec: number | undefined | null): TrafficRateDisplay {
  if (!bytesPerSec || !Number.isFinite(bytesPerSec) || bytesPerSec <= 0) {
    return {
      value: "0",
      unit: "B/s",
      bytesPerSec: 0,
    };
  }

  const thresholds: Array<{ unit: Exclude<TrafficRateUnit, "B/s">; divisor: number }> = [
    { unit: "TB/s", divisor: 1024 ** 4 },
    { unit: "GB/s", divisor: 1024 ** 3 },
    { unit: "MB/s", divisor: 1024 ** 2 },
    { unit: "KB/s", divisor: 1024 },
  ];

  for (const { unit, divisor } of thresholds) {
    if (bytesPerSec >= divisor) {
      return {
        value: formatRateValue(bytesPerSec / divisor),
        unit,
        bytesPerSec,
      };
    }
  }

  return {
    value: bytesPerSec >= 100 ? Math.round(bytesPerSec).toString() : trimFixed(bytesPerSec, 1),
    unit: "B/s",
    bytesPerSec,
  };
}

export function formatTrafficRateLabel(bytesPerSec: number | undefined | null): string {
  const rate = formatTrafficRate(bytesPerSec);
  return `${rate.value} ${rate.unit}`;
}

export function formatUptimeDays(seconds: number): { value: string; unit: string } {
  if (!seconds || seconds <= 0) return { value: "—", unit: "" };
  const days = seconds / 86400;
  if (days >= 1) return { value: Math.floor(days).toString(), unit: "天" };
  const hours = seconds / 3600;
  if (hours >= 1) return { value: Math.floor(hours).toString(), unit: "小时" };
  const minutes = seconds / 60;
  return { value: Math.floor(minutes).toString(), unit: "分钟" };
}

export function getExpireDaysRemaining(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return Math.floor((ts - Date.now()) / 86400000);
}

export function resolveExpireTone(days: number | null | undefined): ExpireTone {
  if (days == null || !Number.isFinite(days)) return "none";
  if (days > 36500) return "long";
  if (days > 30) return "ok";
  if (days > 7) return "warn";
  return "critical";
}

export function formatExpireDays(iso: string | null | undefined): { value: string; unit: string; tone: ExpireTone } {
  const days = getExpireDaysRemaining(iso);
  const tone = resolveExpireTone(days);
  if (days == null) return { value: "—", unit: "", tone };
  if (tone === "long") return { value: "长期", unit: "", tone };
  if (tone === "ok" || tone === "warn") return { value: days.toString(), unit: "天", tone };
  if (days > 0) return { value: days.toString(), unit: "天", tone };
  if (days === 0) return { value: "今日", unit: "", tone };
  return { value: "已过期", unit: "", tone };
}

/** Parse `tag1<color>;tag2<color2>` into [{ label, color }]. */
export function parseTags(raw: string | undefined | null): Array<{ label: string; color: string }> {
  if (!raw) return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const m = item.match(/^(.*?)<([a-zA-Z]+)>$/);
      if (m) return { label: m[1].trim(), color: m[2].toLowerCase() };
      return { label: item, color: "gray" };
    });
}
