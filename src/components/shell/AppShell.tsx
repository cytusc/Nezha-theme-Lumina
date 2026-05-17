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
      <footer className="py-4 text-center text-xs text-[var(--text-tertiary)] opacity-60">
        Powered by{" "}
        <a
          href="https://github.com/nezhahq/nezha"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:opacity-80"
        >
          Nezha
        </a>
        {" "}&{" "}
        <a
          href="https://github.com/stqfdyr/komari-theme-Lumina"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:opacity-80"
        >
          Lumina
        </a>
      </footer>
    </div>
  );
}
