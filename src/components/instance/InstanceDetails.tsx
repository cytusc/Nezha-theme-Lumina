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
    <InstancePanel
      title="实例信息"
      description={
        isOnline ? undefined : "节点当前离线，以下展示最近一次上报的缓存数据。"
      }
    >
      <div className="instance-info-groups">
        <div className="instance-info-group">
          <div className="instance-info-group-title">
            <LayoutGrid size={14} strokeWidth={2.5} />
            <span>系统</span>
          </div>
          <div className="instance-info-content">
            <InfoItem
              icon={<Activity size={13} strokeWidth={2} />}
              label="状态"
              value={isOnline ? "在线" : "离线"}
              color={isOnline ? "var(--status-online)" : "var(--status-offline)"}
            />
            <InfoItem
              icon={<Cpu size={13} strokeWidth={2} />}
              label="CPU"
              value={`${node.cpu_name || "—"}${node.cpu_cores > 0 ? ` (x${node.cpu_cores})` : ""}`}
            />
            <InfoItem
              icon={<Layers size={13} strokeWidth={2} />}
              label="架构"
              value={node.arch || "—"}
            />
            <InfoItem
              icon={<Box size={13} strokeWidth={2} />}
              label="虚拟化"
              value={node.virtualization || "—"}
            />
            <InfoItem
              icon={<Monitor size={13} strokeWidth={2} />}
              label="显卡"
              value={node.gpu_name || "—"}
            />
            <InfoItem
              icon={<Monitor size={13} strokeWidth={2} />}
              label="操作系统"
              value={node.os || "—"}
            />
          </div>
        </div>

        <div className="instance-info-group">
          <div className="instance-info-group-title">
            <Activity size={14} strokeWidth={2.5} />
            <span>资源</span>
          </div>
          <div className="instance-info-content">
            <InfoItem
              icon={<MemoryStick size={13} strokeWidth={2} />}
              label="内存"
              value={`${formatBytes(node.ramUsed)} / ${formatBytes(node.ramTotal)}`}
            />
            <InfoItem
              icon={<RefreshCw size={13} strokeWidth={2} />}
              label="Swap"
              value={
                node.swapTotal > 0
                  ? `${formatBytes(node.swapUsed)} / ${formatBytes(node.swapTotal)}`
                  : "无"
              }
            />
            <InfoItem
              icon={<HardDrive size={13} strokeWidth={2} />}
              label="磁盘"
              value={`${formatBytes(node.diskUsed)} / ${formatBytes(node.diskTotal)}`}
            />
            <InfoItem
              icon={<Gauge size={13} strokeWidth={2} />}
              label="负载"
              value={`${node.load1.toFixed(2)} | ${node.load5.toFixed(2)} | ${node.load15.toFixed(2)}`}
            />
            <InfoItem
              icon={<Clock size={13} strokeWidth={2} />}
              label="运行时长"
              value={
                uptime.unit ? `${uptime.value} ${uptime.unit}` : uptime.value
              }
            />
          </div>
        </div>

        <div className="instance-info-group">
          <div className="instance-info-group-title">
            <Globe size={14} strokeWidth={2.5} />
            <span>网络</span>
          </div>
          <div className="instance-info-content">
            <InfoItem
              icon={<Network size={13} strokeWidth={2} />}
              label={isOnline ? "实时网络" : "缓存网络"}
              value={`↑ ${formatTrafficRateLabel(node.netUp)} · ↓ ${formatTrafficRateLabel(node.netDown)}`}
            />
            <InfoItem
              icon={<RefreshCw size={13} strokeWidth={2} />}
              label={isOnline ? "最近更新" : "最后上报"}
              value={lastUpdated}
            />
            <div className="instance-info-item is-stack">
              <div className="instance-info-label">
                <Globe size={13} strokeWidth={2} />
                <span>总流量</span>
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
  );
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
