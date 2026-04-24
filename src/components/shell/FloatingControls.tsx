import { AlertTriangle, Monitor, Settings, Sun, Moon } from "lucide-react";
import { clsx } from "clsx";
import { usePreferences } from "@/hooks/usePreferences";
import { useNodeStoreStatus } from "@/hooks/useNode";
import { useAuth } from "@/hooks/useAuth";

const APPEARANCE_OPTIONS = [
  { value: "light", icon: Sun, label: "浅色" },
  { value: "system", icon: Monitor, label: "跟随系统" },
  { value: "dark", icon: Moon, label: "深色" },
] as const;

export function FloatingControls() {
  const { appearance, setAppearance } = usePreferences();
  const { data: me } = useAuth();
  const { failureStreak } = useNodeStoreStatus();
  const showSyncWarning = failureStreak >= 2;
  const adminLabel = me?.logged_in ? "管理后台" : "登录后台";

  return (
    <div className="fixed right-4 top-4 z-40 flex justify-end sm:right-5 sm:top-5">
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <div className="control-group" role="group" aria-label="外观选择">
            {APPEARANCE_OPTIONS.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setAppearance(value)}
                aria-label={label}
                aria-pressed={appearance === value}
                title={label}
                className={clsx(
                  "control-button control-toggle grid h-9 w-9 place-items-center",
                  appearance === value && "is-active",
                )}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
          <a
            href="/dashboard/"
            aria-label={adminLabel}
            title={adminLabel}
            className="control-button grid h-9 w-9 place-items-center"
          >
            <Settings size={16} />
          </a>
        </div>
        {showSyncWarning && (
          <div className="pointer-events-none flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--status-offline)_32%,transparent)] bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] px-3 py-1 text-[11px] font-medium text-[var(--status-offline)] shadow-[0_10px_25px_-18px_rgba(0,0,0,0.8)] backdrop-blur">
            <AlertTriangle size={12} />
            <span>实时状态同步异常，当前展示的是最近缓存</span>
          </div>
        )}
      </div>
    </div>
  );
}
