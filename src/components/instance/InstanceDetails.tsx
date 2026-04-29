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
import { LogoMark } from "@/components/ui/LogoMark";

const CPU_LOGO_MAP = [
  { match: ["intel"], src: "/assets/logos/cpu/intel.svg", alt: "Intel" },
  { match: ["amd", "epyc", "ryzen"], src: "/assets/logos/cpu/amd.svg", alt: "AMD" },
] as const;

const OS_LOGO_MAP = [
  { match: ["debian"], src: "/assets/logos/os/debian.svg", alt: "Debian" },
  { match: ["ubuntu"], src: "/assets/logos/os/ubuntu.svg", alt: "Ubuntu" },
  { match: ["windows"], src: "/assets/logos/os/windows.svg", alt: "Windows" },
  { match: ["centos"], src: "/assets/logos/os/centos.svg", alt: "CentOS" },
  { match: ["almalinux", "alma"], src: "/assets/logos/os/almalinux.svg", alt: "AlmaLinux" },
  { match: ["rockylinux", "rocky"], src: "/assets/logos/os/rockylinux.svg", alt: "Rocky Linux" },
  { match: ["archlinux", "arch"], src: "/assets/logos/os/arch.svg", alt: "Arch Linux" },
  { match: ["fedora"], src: "/assets/logos/os/fedora.svg", alt: "Fedora" },
  { match: ["opensuse", "open suse", "suse"], src: "/assets/logos/os/opensuse.svg", alt: "openSUSE" },
  { match: ["alpine", "alpinelinux"], src: "/assets/logos/os/alpine.svg", alt: "Alpine Linux" },
  { match: ["freebsd"], src: "/assets/logos/os/freebsd.svg", alt: "FreeBSD" },
  { match: ["openwrt"], src: "/assets/logos/os/openwrt.svg", alt: "OpenWrt" },
  { match: ["macos", "os x", "darwin", "mac"], src: "/assets/logos/os/apple.svg", alt: "Apple" },
] as const;

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

function resolveLogo<T extends { match: readonly string[] }>(name: string | undefined, entries: readonly T[]) {
  const value = name?.toLowerCase().trim() ?? "";
  if (!value) return null;
  return entries.find((entry) => entry.match.some((keyword) => value.includes(keyword))) ?? null;
}

function VendorLogo({ name }: { name?: string }) {
  const logo = resolveLogo(name, CPU_LOGO_MAP);
  return (
    <LogoMark
      src={logo?.src}
      alt={logo?.alt ?? "CPU"}
      fallback={<Cpu size={13} strokeWidth={2} />}
    />
  );
}

function OSLogo({ name }: { name?: string }) {
  const logo = resolveLogo(name, OS_LOGO_MAP);
  return (
    <LogoMark
      src={logo?.src}
      alt={logo?.alt ?? "操作系统"}
      fallback={<Monitor size={13} strokeWidth={2} />}
    />
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
