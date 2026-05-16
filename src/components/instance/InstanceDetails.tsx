import type { ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
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

const CPU_LOGO_MAP = [
  {
    match: ["platinum"],
    src: "/assets/logos/cpu/intel-inside-2020.svg",
    alt: "Intel Xeon Platinum",
  },
  {
    match: ["gold"],
    src: "/assets/logos/cpu/intel-core-i7-2020.svg",
    alt: "Intel Xeon Gold",
  },
  {
    match: ["silver"],
    src: "/assets/logos/cpu/intel-inside-2020.svg",
    alt: "Intel Xeon Silver",
  },
  {
    match: ["xeon", "e5-", "e3-"],
    src: "/assets/logos/cpu/intel-inside-2020.svg",
    alt: "Intel Xeon",
  },
  { match: ["intel"], src: "/assets/logos/cpu/intel-inside-2020.svg", alt: "Intel Inside" },
  { match: ["epyc"], src: "/assets/logos/cpu/amd-ryzen-logo.svg", alt: "AMD EPYC" },
  {
    match: ["amd", "ryzen", "threadripper"],
    src: "/assets/logos/cpu/amd-ryzen-logo.svg",
    alt: "AMD Ryzen",
  },
] as const;

const OS_LOGO_MAP = [
  { match: ["debian"], src: "/assets/logos/os/debian.svg", alt: "Debian" },
  { match: ["ubuntu"], src: "/assets/logos/os/ubuntu.svg", alt: "Ubuntu" },
  { match: ["windows"], src: "/assets/logos/os/windows.svg", alt: "Windows" },
  { match: ["centos"], src: "/assets/logos/os/centos.svg", alt: "CentOS" },
  {
    match: ["almalinux", "alma"],
    src: "/assets/logos/os/almalinux.svg",
    alt: "AlmaLinux",
  },
  {
    match: ["rockylinux", "rocky"],
    src: "/assets/logos/os/rockylinux.svg",
    alt: "Rocky Linux",
  },
  { match: ["archlinux", "arch"], src: "/assets/logos/os/arch.svg", alt: "Arch" },
  { match: ["fedora"], src: "/assets/logos/os/fedora.svg", alt: "Fedora" },
  {
    match: ["opensuse", "open suse", "suse"],
    src: "/assets/logos/os/opensuse.svg",
    alt: "openSUSE",
  },
  {
    match: ["alpine", "alpinelinux"],
    src: "/assets/logos/os/alpine.svg",
    alt: "Alpine",
  },
  { match: ["freebsd"], src: "/assets/logos/os/freebsd.svg", alt: "FreeBSD" },
  { match: ["openwrt"], src: "/assets/logos/os/openwrt.svg", alt: "OpenWrt" },
  {
    match: ["macos", "os x", "darwin", "mac"],
    src: "/assets/logos/os/apple.svg",
    alt: "Apple",
  },
] as const;

const GPU_LOGO_MAP = [
  {
    match: ["nvidia", "geforce", "quadro", "tesla"],
    src: "/assets/logos/gpu/nvidia.svg",
    alt: "NVIDIA",
  },
  {
    match: ["amd", "radeon", "vega", "navi"],
    src: "/assets/logos/gpu/radeon-gpu.svg",
    alt: "AMD Radeon",
  },
  {
    match: ["intel", "hd graphics", "uhd graphics", "iris", "arc"],
    src: "/assets/logos/gpu/intel-gpu.svg",
    alt: "Intel Graphics",
  },
] as const;

export function InstanceDetails({ uuid }: { uuid: string }) {
  const node = useNode(uuid);
  if (!node) return null;

  const isOnline = node.online;
  const uptime = formatUptimeDays(node.uptime);
  const trafficUsed = node.trafficUp + node.trafficDown;
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
                icon={<Cpu size={13} strokeWidth={2} />}
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
                multiline
              />
              <InfoItem
                icon={<Monitor size={13} strokeWidth={2} />}
                label="操作系统"
                value={node.os || "—"}
              />
              <InstanceStickers node={node} />
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
                progress={node.ramTotal > 0 ? (node.ramUsed / node.ramTotal) * 100 : 0}
                type="memory"
              />
              <InfoItem
                icon={<RefreshCw size={13} strokeWidth={2} />}
                label="虚拟内存"
                value={
                  node.swapTotal > 0
                    ? `${formatBytes(node.swapUsed)} / ${formatBytes(node.swapTotal)}`
                    : "无"
                }
                progress={node.swapTotal > 0 ? (node.swapUsed / node.swapTotal) * 100 : undefined}
                type="swap"
              />
              <InfoItem
                icon={<HardDrive size={13} strokeWidth={2} />}
                label="磁盘存储"
                value={`${formatBytes(node.diskUsed)} / ${formatBytes(node.diskTotal)}`}
                progress={node.diskTotal > 0 ? (node.diskUsed / node.diskTotal) * 100 : 0}
                type="disk"
              />
              <InfoItem
                icon={<Gauge size={13} strokeWidth={2} />}
                label="平均负载"
                value={`${node.load1.toFixed(2)} | ${node.load5.toFixed(2)} | ${node.load15.toFixed(2)}`}
                progress={node.cpu_cores > 0 ? Math.min(100, (node.load1 / node.cpu_cores) * 100) : 0}
                type="cpu"
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
                value={
                  <div className="network-speed-values">
                    <span className="speed-item is-up">
                      <ArrowUpRight size={12} strokeWidth={2.5} />
                      {formatTrafficRateLabel(node.netUp)}
                    </span>
                    <span className="speed-sep">·</span>
                    <span className="speed-item is-down">
                      <ArrowDownLeft size={12} strokeWidth={2.5} />
                      {formatTrafficRateLabel(node.netDown)}
                    </span>
                  </div>
                }
              />
              <InfoItem
                icon={<RefreshCw size={13} strokeWidth={2} />}
                label={isOnline ? "上报时间" : "最后在线"}
                value={lastUpdated}
              />
              <InfoItem
                icon={<Globe size={13} strokeWidth={2} />}
                label="流量统计"
                value={
                  <div className="network-speed-values">
                    <span className="speed-item">
                      <ArrowUpRight size={12} strokeWidth={2.5} />
                      {formatBytes(node.trafficUp)}
                    </span>
                    <span className="speed-sep">·</span>
                    <span className="speed-item">
                      <ArrowDownLeft size={12} strokeWidth={2.5} />
                      {formatBytes(node.trafficDown)}
                    </span>
                  </div>
                }
                progress={node.traffic_limit > 0 ? (trafficUsed / node.traffic_limit) * 100 : undefined}
                type="network"
              />
              {node.traffic_limit > 0 && (
                <div className="instance-info-item" style={{ marginTop: "-8px" }}>
                  <div className="instance-info-label" />
                  <div className="instance-info-note" style={{ fontSize: "10px" }}>
                    配额 {formatBytes(node.traffic_limit)} (已消耗 {formatBytes(trafficUsed)})
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </InstancePanel>
    </div>
  );
}

function resolveLogo<T extends { match: readonly string[] }>(
  name: string | undefined,
  entries: readonly T[],
) {
  const value = name?.toLowerCase().trim() ?? "";
  if (!value) return null;
  return (
    entries.find((entry) =>
      entry.match.some((keyword) => value.includes(keyword)),
    ) ?? null
  );
}

function InstanceStickers({ node }: { node: any }) {
  const cpuLogo = resolveLogo(node.cpu_name, CPU_LOGO_MAP);
  const osLogo = resolveLogo(node.os, OS_LOGO_MAP);

  const cpuName = node.cpu_name || "";
  const isIntel = cpuName.toLowerCase().includes("intel") || cpuLogo?.alt?.includes("Intel");
  const isAmd = cpuName.toLowerCase().includes("amd") || cpuName.toLowerCase().includes("epyc") || cpuName.toLowerCase().includes("ryzen") || cpuLogo?.alt?.includes("AMD");

  const osInfo = parseOsInfo(node.os || "");

  const gpuList = (node.gpu_name || "").split("\n").filter((gpu: string) => gpu.trim());
  const hasAnyContent = cpuLogo || osLogo || (gpuList.length > 0);

  if (!hasAnyContent) return null;

  return (
    <div className="instance-stickers">
      {cpuLogo && (
        <div
          className={`instance-sticker is-cpu ${isIntel ? "is-intel" : isAmd ? "is-amd" : ""}`}
          title={cpuLogo.alt}
        >
          <img src={cpuLogo.src} alt={cpuLogo.alt} />
          <div className="sticker-text">
            <span className="sticker-brand">{isIntel ? "Intel" : isAmd ? "AMD" : "CPU"}</span>
            <span className="sticker-model">{extractCpuSeries(cpuName)}</span>
          </div>
          <div className="sticker-shine" />
        </div>
      )}
      {gpuList.map((gpuName: string, index: number) => {
        const gpuLogo = resolveLogo(gpuName, GPU_LOGO_MAP);
        if (!gpuLogo) return null;

        const trimmedGpu = gpuName.trim();
        const isNvidia = trimmedGpu.toLowerCase().includes("nvidia") || trimmedGpu.toLowerCase().includes("geforce") || trimmedGpu.toLowerCase().includes("quadro") || trimmedGpu.toLowerCase().includes("tesla");
        const isAmdGpu = trimmedGpu.toLowerCase().includes("amd") || trimmedGpu.toLowerCase().includes("radeon") || trimmedGpu.toLowerCase().includes("vega") || trimmedGpu.toLowerCase().includes("navi");
        const isIntelGpu = trimmedGpu.toLowerCase().includes("intel");

        return (
          <div
            key={`gpu-${index}`}
            className={`instance-sticker is-gpu ${isNvidia ? "is-nvidia" : isAmdGpu ? "is-amd-gpu" : isIntelGpu ? "is-intel-gpu" : ""}`}
            title={trimmedGpu}
          >
            <img src={gpuLogo.src} alt={gpuLogo.alt} />
            <div className="sticker-text">
              <span className="sticker-brand">{isNvidia ? "NVIDIA" : isAmdGpu ? "AMD" : isIntelGpu ? "Intel" : "GPU"}</span>
              <span className="sticker-model">{extractGpuSeries(trimmedGpu)}</span>
            </div>
            <div className="sticker-shine" />
          </div>
        );
      })}
      {osLogo && (
        <div className={`instance-sticker is-os ${osInfo.brandId ? `is-${osInfo.brandId}` : ""}`} title={osLogo.alt}>
          <img src={osLogo.src} alt={osLogo.alt} />
          <div className="sticker-text">
            <span className="sticker-brand">{osInfo.company}</span>
            <span className="sticker-model">{osInfo.name}</span>
          </div>
          <div className="sticker-shine" />
        </div>
      )}
    </div>
  );
}

function extractCpuSeries(cpuName: string): string {
  if (!cpuName) return "Processor";
  const name = cpuName.trim();

  // Pattern matching for major series
  const patterns = [
    { match: /Ryzen\s+\d+/i, out: (m: string) => m },
    { match: /EPYC/i, out: () => "EPYC" },
    { match: /Xeon\s+\w+/i, out: (m: string) => m },
    { match: /Core\s+i[3579]/i, out: (m: string) => m },
    { match: /Threadripper/i, out: () => "Threadripper" },
    { match: /Pentium|Celeron/i, out: (m: string) => m },
    { match: /Apple\s+(M\d+\s+\w+|M\d+)/i, out: (m: string) => m.replace("Apple ", "") },
  ];

  for (const p of patterns) {
    const match = name.match(p.match);
    if (match) return p.out(match[0]);
  }

  // Fallback: clean up the name a bit
  return name.split(" ")[0] || "CPU";
}

function extractGpuSeries(gpuName: string): string {
  if (!gpuName) return "Graphics";
  const name = gpuName.trim();

  // Pattern matching for major GPU series - NVIDIA优先简化显示
  const patterns = [
    // NVIDIA - 简化显示，去掉GeForce前缀
    { match: /GeForce\s+(GTX|RTX)\s+\d+\s*\w*/i, out: (m: string) => m.replace("GeForce ", "") },
    { match: /GeForce\s+(GTX|RTX)\s+\d+/i, out: (m: string) => m.replace("GeForce ", "") },
    { match: /Quadro\s+\w+/i, out: (m: string) => m },
    { match: /Tesla\s+\w+/i, out: (m: string) => m },
    // AMD Radeon
    { match: /Radeon\s+RX\s+\d+\s*\w*/i, out: (m: string) => m.replace("Radeon ", "") },
    { match: /Radeon\s+RX\s+\d+/i, out: (m: string) => m.replace("Radeon ", "") },
    { match: /Radeon\s+Pro\s+\w+/i, out: (m: string) => m.replace("Radeon ", "Pro ") },
    { match: /Radeon\s+(HD\s+\d+)/i, out: (m: string) => m.replace("Radeon ", "") },
    { match: /Radeon\s+(Vega\s+\d*)/i, out: (m: string) => m.replace("Radeon ", "") },
    { match: /Radeon\s*\(TM\)\s*Graphics/i, out: () => "Radeon" },
    { match: /Radeon\s*Graphics/i, out: () => "Radeon" },
    { match: /Vega\s+\d+/i, out: (m: string) => m },
    { match: /Navi\s+\d+/i, out: (m: string) => m },
    // Intel Graphics
    { match: /HD\s+Graphics\s*\d*/i, out: () => "HD Graphics" },
    { match: /UHD\s+Graphics\s*\d*/i, out: () => "UHD Graphics" },
    { match: /Iris\s+(Plus|Pro|\s*\d*)/i, out: () => "Iris" },
    { match: /Intel\s+Arc\s+\w+/i, out: (m: string) => m.replace("Intel ", "") },
    { match: /Intel\s*\(R\)\s*HD Graphics/i, out: () => "HD Graphics" },
  ];

  for (const p of patterns) {
    const match = name.match(p.match);
    if (match) return p.out(match[0]);
  }

  // Fallback: clean up the name a bit
  return name.split(" ")[0] || "GPU";
}

function parseOsInfo(os: string) {
  const value = os.toLowerCase();

  const brands = [
    { id: "windows", match: ["windows", "win"], company: "Microsoft", name: "Windows" },
    { id: "debian", match: ["debian"], company: "Debian", name: "Debian" },
    { id: "ubuntu", match: ["ubuntu"], company: "Canonical", name: "Ubuntu" },
    { id: "centos", match: ["centos"], company: "CentOS", name: "CentOS" },
    { id: "fedora", match: ["fedora"], company: "Fedora Project", name: "Fedora" },
    { id: "arch", match: ["arch"], company: "Arch Linux", name: "Arch Linux" },
    { id: "alpine", match: ["alpine"], company: "Alpine", name: "Alpine" },
    { id: "apple", match: ["macos", "os x", "darwin", "apple"], company: "Apple Inc.", name: "macOS" },
    { id: "suse", match: ["suse", "opensuse"], company: "SUSE", name: "openSUSE" },
    { id: "redhat", match: ["redhat", "rhel"], company: "Red Hat", name: "RHEL" },
  ];

  for (const b of brands) {
    if (b.match.some(k => value.includes(k))) {
      // Try to extract version
      let version = "";
      const versionMatch = os.match(/\d+(\.\d+)*/);
      if (versionMatch) version = " " + versionMatch[0];

      return {
        brandId: b.id,
        company: b.company,
        name: b.name + version
      };
    }
  }

  return {
    brandId: null,
    company: "OS",
    name: os.split(" ")[0] || "Linux"
  };
}

function ParticleProgress({ value, type }: { value: number; type?: string }) {
  const blocks = 20;
  const activeBlocks = Math.round((Math.max(0, Math.min(100, value)) / 100) * blocks);

  // Define gradient ranges for different metrics
  const getGradientColors = () => {
    switch (type) {
      case "cpu":
        return { start: "var(--progress-cpu)", end: "var(--progress-memory)" };
      case "memory":
        return { start: "var(--progress-memory)", end: "#ec4899" }; // Purple to Pink
      case "disk":
        return { start: "var(--progress-disk)", end: "var(--status-error)" }; // Orange to Red
      case "swap":
        return { start: "var(--progress-swap)", end: "var(--progress-memory)" };
      case "network":
        return { start: "#10b981", end: "#3b82f6" };
      default:
        return { start: "var(--text-tertiary)", end: "var(--text-secondary)" };
    }
  };

  const { start, end } = getGradientColors();

  return (
    <div className="particle-progress" aria-hidden>
      {Array.from({ length: blocks }).map((_, i) => {
        const isActive = i < activeBlocks;
        // Calculate color based on position (0 to 1)
        const ratio = i / (blocks - 1);
        const color = `color-mix(in srgb, ${start}, ${end} ${ratio * 100}%)`;

        return (
          <div
            key={i}
            className={clsx("particle-block", isActive && "is-active")}
            style={
              {
                "--active-color": color,
                "--index": i,
              } as any
            }
          />
        );
      })}
    </div>
  );
}

function InfoItem({
  icon,
  label,
  value,
  color,
  multiline = false,
  progress,
  type,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  color?: string;
  multiline?: boolean;
  progress?: number;
  type?: string;
}) {
  return (
    <div className="instance-info-item">
      <div className="instance-info-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="instance-info-value-group">
        <div
          className="instance-info-value"
          style={{
            color,
            whiteSpace: multiline ? "pre-wrap" : undefined,
            wordBreak: multiline ? "break-word" : undefined,
          }}
        >
          {value}
        </div>
        {progress !== undefined && (
          <ParticleProgress value={progress} type={type} />
        )}
      </div>
    </div>
  );
}
