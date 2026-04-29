import type { ReactNode } from "react";
import {
  Activity,
  Box,
  Clock,
  Cpu,
  Gauge,
  Globe,
  HardDrive,
  Layers,
  LayoutGrid,
  MemoryStick,
  Monitor,
  Network,
  RefreshCw,
} from "lucide-react";
import { useNode } from "@/hooks/useNode";
import {
  formatBytes,
  formatTrafficRateLabel,
  formatUptimeDays,
} from "@/utils/format";
import { InstancePanel } from "./InstancePanel";
import { Flag } from "@/components/ui/Flag";
import { clsx } from "clsx";

export function InstanceDetails({ uuid }: { uuid: string }) {
  const node = useNode(uuid);
  if (!node) return null;

  const isOnline = node.online;
  const uptime = formatUptimeDays(node.uptime);
  const trafficUsed = node.trafficUp + node.trafficDown;
  const trafficFraction =
    node.traffic_limit > 0
      ? Math.max(0, Math.min(1, trafficUsed / node.traffic_limit))
      : 0;
  const lastUpdated =
    node.updatedAt > 0
      ? new Intl.DateTimeFormat("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(node.updatedAt)
      : "—";

  return (
    <div className="instance-details-stack">
      <div className="instance-details-hero">
        <div className="instance-hero-main">
          <div className="instance-hero-title-row">
            <Flag region={node.region} size={22} />
            <h1 className="instance-hero-name" title={node.name}>
              {node.name}
            </h1>
            <div
              className={clsx(
                "instance-hero-status-dot",
                isOnline ? "is-online" : "is-offline",
              )}
              style={{
                background: isOnline
                  ? "var(--status-online)"
                  : "var(--status-offline)",
                boxShadow: `0 0 0 4px color-mix(in srgb, ${isOnline ? "var(--status-online)" : "var(--status-offline)"} 20%, transparent)`,
              }}
            />
          </div>
          <div className="instance-hero-meta-row">
            <span className="instance-hero-badge">
              {node.group || "默认分组"}
            </span>
            {node.public_remark && (
              <span className="instance-hero-remark">{node.public_remark}</span>
            )}
          </div>
        </div>
      </div>

      <InstancePanel
        title="实例详情"
        description={
          isOnline
            ? undefined
            : "节点当前离线，以下展示最近一次上报的缓存数据。"
        }
      >
        <div className="instance-info-groups">
          <div className="instance-info-group">
            <div className="instance-info-group-title">
              <LayoutGrid size={14} strokeWidth={2.5} />
              <span>系统架构</span>
            </div>
            <div className="instance-info-content">
              <InfoItem
                icon={<Activity size={13} strokeWidth={2} />}
                label="实时状态"
                value={isOnline ? "在线" : "离线"}
                color={
                  isOnline ? "var(--status-online)" : "var(--status-offline)"
                }
              />
              <InfoItem
                icon={<VendorLogo name={node.cpu_name} />}
                label="处理器"
                value={`${node.cpu_name || "—"}${node.cpu_cores > 0 ? ` (x${node.cpu_cores})` : ""}`}
              />
              <InfoItem
                icon={<Layers size={13} strokeWidth={2} />}
                label="指令集"
                value={node.arch || "—"}
              />
              <InfoItem
                icon={<Box size={13} strokeWidth={2} />}
                label="虚拟化"
                value={node.virtualization || "—"}
              />
              <InfoItem
                icon={<Monitor size={13} strokeWidth={2} />}
                label="显卡设备"
                value={node.gpu_name || "—"}
              />
              <InfoItem
                icon={<OSLogo name={node.os} />}
                label="操作系统"
                value={node.os || "—"}
              />
            </div>
          </div>

          <div className="instance-info-group">
            <div className="instance-info-group-title">
              <Activity size={14} strokeWidth={2.5} />
              <span>性能统计</span>
            </div>
            <div className="instance-info-content">
              <InfoItem
                icon={<MemoryStick size={13} strokeWidth={2} />}
                label="物理内存"
                value={`${formatBytes(node.ramUsed)} / ${formatBytes(node.ramTotal)}`}
              />
              <InfoItem
                icon={<RefreshCw size={13} strokeWidth={2} />}
                label="虚拟内存"
                value={
                  node.swapTotal > 0
                    ? `${formatBytes(node.swapUsed)} / ${formatBytes(node.swapTotal)}`
                    : "无"
                }
              />
              <InfoItem
                icon={<HardDrive size={13} strokeWidth={2} />}
                label="磁盘存储"
                value={`${formatBytes(node.diskUsed)} / ${formatBytes(node.diskTotal)}`}
              />
              <InfoItem
                icon={<Gauge size={13} strokeWidth={2} />}
                label="平均负载"
                value={`${node.load1.toFixed(2)} | ${node.load5.toFixed(2)} | ${node.load15.toFixed(2)}`}
              />
              <InfoItem
                icon={<Clock size={13} strokeWidth={2} />}
                label="持续运行"
                value={
                  uptime.unit ? `${uptime.value} ${uptime.unit}` : uptime.value
                }
              />
            </div>
          </div>

          <div className="instance-info-group">
            <div className="instance-info-group-title">
              <Globe size={14} strokeWidth={2.5} />
              <span>网络概览</span>
            </div>
            <div className="instance-info-content">
              <InfoItem
                icon={<Network size={13} strokeWidth={2} />}
                label={isOnline ? "实时速率" : "离线速率"}
                value={`↑ ${formatTrafficRateLabel(node.netUp)} · ↓ ${formatTrafficRateLabel(node.netDown)}`}
              />
              <InfoItem
                icon={<RefreshCw size={13} strokeWidth={2} />}
                label={isOnline ? "上报时间" : "最后在线"}
                value={lastUpdated}
              />
              <div className="instance-info-item is-stack">
                <div className="instance-info-label">
                  <Globe size={13} strokeWidth={2} />
                  <span>流量统计</span>
                </div>
                <div className="instance-info-traffic">
                  <span className="instance-info-value">
                    {`↑ ${formatBytes(node.trafficUp)} · ↓ ${formatBytes(node.trafficDown)}`}
                  </span>
                  {node.traffic_limit > 0 && (
                    <>
                      <div className="instance-progress-track" aria-hidden>
                        <span
                          className="instance-progress-fill"
                          style={{ width: `${trafficFraction * 100}%` }}
                        />
                      </div>
                      <span className="instance-info-note">
                        {`${formatBytes(trafficUsed)} / ${formatBytes(node.traffic_limit)}`}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </InstancePanel>
    </div>
  );
}

function VendorLogo({ name }: { name?: string }) {
  const low = name?.toLowerCase() ?? "";
  if (low.includes("intel")) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path
          d="M2 3h20v18H2V3zm16 14v-2h-2v2h2zm-4 0v-6h-2v6h2zm-4 0v-4H8v4h2z"
          fill="#0071C5"
        />
      </svg>
    );
  }
  if (low.includes("amd")) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M22 2L12 12l10 10V2zM2 22L12 12 2 2v20z" fill="#ED1C24" />
      </svg>
    );
  }
  return <Cpu size={13} strokeWidth={2} />;
}

function OSLogo({ name }: { name?: string }) {
  const low = name?.toLowerCase() ?? "";
  if (low.includes("debian")) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"
          fill="#D70A53"
        />
      </svg>
    );
  }
  if (low.includes("ubuntu")) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#E95420" />
        <circle cx="12" cy="12" r="4" fill="white" />
      </svg>
    );
  }
  if (low.includes("windows")) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M2 3l9-1.5V11H2V3zm0 18l9 1.5V13H2v6.5zM12 1.5L22 0V11h-10V1.5zM12 22.5L22 24V13H12v9.5z" fill="#0078D7" />
      </svg>
    );
  }
  return <Monitor size={13} strokeWidth={2} />;
}

function InfoItem({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="instance-info-item">
      <div className="instance-info-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="instance-info-value" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
