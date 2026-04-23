import { AlertTriangle, Monitor, Settings, SlidersHorizontal, Sun, Moon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { usePreferences } from "@/hooks/usePreferences";
import { useNodeStoreStatus } from "@/hooks/useNode";
import { useAuth } from "@/hooks/useAuth";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { clsx } from "clsx";

const APPEARANCE_OPTIONS = [
  { value: "light", icon: Sun, label: "浅色" },
  { value: "system", icon: Monitor, label: "跟随系统" },
  { value: "dark", icon: Moon, label: "深色" },
] as const;

export function FloatingControls() {
  const { appearance, setAppearance } = usePreferences();
  const { data: me } = useAuth();
  const { data: config } = usePublicConfig();
  const { failureStreak } = useNodeStoreStatus();
  const [searchParams] = useSearchParams();
  const showAdmin = config?.theme_settings?.enableAdminButton !== false;
  const showThemeManage = Boolean(me?.logged_in);
  const isThemeManageView = searchParams.get("view") === "theme-manage";
  const showSyncWarning = failureStreak >= 2;

  if (isThemeManageView) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-40 flex justify-end sm:right-5 sm:top-5">
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <div
            className="control-group"
            role="group"
            aria-label="外观选择"
          >
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
          {showThemeManage && (
            <Link
              to="/?view=theme-manage"
              aria-label="主题设置"
              title="主题设置"
              className={clsx(
                "control-button grid h-9 w-9 place-items-center",
                isThemeManageView && "control-toggle is-active",
              )}
            >
              <SlidersHorizontal size={16} />
            </Link>
          )}
          {showAdmin && (
            <a
              href="/admin"
              aria-label={me?.logged_in ? "管理" : "后台登录"}
              title={me?.logged_in ? "管理" : "后台登录"}
              className="control-button grid h-9 w-9 place-items-center"
            >
              <Settings size={16} />
            </a>
          )}
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
