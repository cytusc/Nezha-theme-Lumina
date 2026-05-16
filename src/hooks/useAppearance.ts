import { useEffect } from "react";
import { usePreferences } from "@/hooks/usePreferences";

export function useAppearance() {
  const { resolvedAppearance } = usePreferences();

  useEffect(() => {
    document.documentElement.dataset.appearance = resolvedAppearance;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      meta.content = resolvedAppearance === "dark" ? "#000000" : "#F5F5F7";
    }
  }, [resolvedAppearance]);
}
