import { Outlet } from "react-router-dom";
import { FloatingControls } from "./FloatingControls";
import { useAppearance } from "@/hooks/useAppearance";

export function AppShell() {
  useAppearance();
  return (
    <div className="relative flex min-h-screen flex-col">
      <FloatingControls />
      <main className="flex-1 px-3 pb-8 pt-5 sm:px-5 md:px-6 lg:px-8 lg:pt-6">
        <div className="mx-auto w-full max-w-[1720px]">
          <Outlet />
        </div>
      </main>
      <footer className="py-8">
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--fill-tertiary)] px-4 py-1.5 text-xs text-[var(--text-tertiary)] transition-colors hover:border-[var(--border)] hover:bg-[var(--fill-secondary)]">
            <span>Powered by</span>
            <a
              href="https://github.com/nezhahq/nezha"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Nezha
            </a>
            <span className="opacity-50">&</span>
            <a
              href="https://github.com/stqfdyr/komari-theme-Lumina"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Lumina
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
