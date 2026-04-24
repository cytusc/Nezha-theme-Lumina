import { useCallback, useSyncExternalStore } from "react";

type Appearance = "system" | "light" | "dark";
type ResolvedAppearance = "light" | "dark";
const APPEARANCE_STORAGE_KEY = "appearance";

interface PrefsState {
  appearance: Appearance;
  resolvedAppearance: ResolvedAppearance;
}

const DEFAULTS: PrefsState = {
  appearance: "system",
  resolvedAppearance: "dark",
};

let themeFlipTimer: number | null = null;

function isAppearance(value: unknown): value is Appearance {
  return value === "system" || value === "light" || value === "dark";
}

function resolveAppearance(appearance: Appearance): ResolvedAppearance {
  if (appearance === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return appearance;
}

function parseStoredAppearance(raw: string | null): Appearance | null {
  if (raw == null) return null;
  if (isAppearance(raw)) return raw;

  try {
    const parsed = JSON.parse(raw);
    return isAppearance(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readStoredAppearance() {
  return parseStoredAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY)) ?? DEFAULTS.appearance;
}

function persistAppearance(value: Appearance) {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(value));
}

const listeners = new Set<() => void>();
let snapshot: PrefsState = { ...DEFAULTS };

function emit() {
  for (const listener of listeners) listener();
}

function markThemeFlip() {
  const root = document.documentElement;
  root.classList.add("theme-flip");
  if (themeFlipTimer != null) {
    window.clearTimeout(themeFlipTimer);
  }
  themeFlipTimer = window.setTimeout(() => {
    root.classList.remove("theme-flip");
    themeFlipTimer = null;
  }, 140);
}

function commit(next: Partial<PrefsState>) {
  const merged: PrefsState = { ...snapshot, ...next };
  if (next.appearance) {
    merged.resolvedAppearance = resolveAppearance(merged.appearance);
  }
  if (snapshot.resolvedAppearance !== merged.resolvedAppearance) {
    markThemeFlip();
  }
  snapshot = merged;
  document.documentElement.dataset.appearance = merged.resolvedAppearance;
  emit();
}

let initialized = false;
function initIfNeeded() {
  if (initialized) return;
  initialized = true;

  const storedAppearance = readStoredAppearance();
  persistAppearance(storedAppearance);
  commit({ appearance: storedAppearance });

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (snapshot.appearance === "system") {
        commit({ appearance: "system" });
      }
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function usePreferences() {
  initIfNeeded();
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setAppearance = useCallback((appearance: Appearance) => {
    persistAppearance(appearance);
    commit({ appearance });
  }, []);

  return {
    appearance: state.appearance,
    resolvedAppearance: state.resolvedAppearance,
    setAppearance,
  };
}
