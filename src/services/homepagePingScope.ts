type Listener = () => void;

const ACTIVE_SCOPE_EMIT_DEBOUNCE_MS = 120;
const ACTIVE_SCOPE_RELEASE_DELAY_MS = 180;

const activeUuids = new Set<string>();
const listeners = new Set<Listener>();
const releaseTimers = new Map<string, number>();
let cachedSnapshot: string[] = [];
let cachedSnapshotKey = "";
let emitTimer: number | null = null;

function flushEmit() {
  emitTimer = null;
  const nextSnapshot = Array.from(activeUuids).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  const nextKey = nextSnapshot.join("|");
  if (nextKey === cachedSnapshotKey) return;

  cachedSnapshot = nextSnapshot;
  cachedSnapshotKey = nextKey;
  for (const listener of listeners) {
    listener();
  }
}

function scheduleEmit() {
  if (emitTimer != null) return;
  emitTimer = window.setTimeout(flushEmit, ACTIVE_SCOPE_EMIT_DEBOUNCE_MS);
}

export function setHomepagePingActive(uuid: string, active: boolean) {
  const key = uuid.trim();
  if (!key) return;

  const releaseTimer = releaseTimers.get(key);
  if (releaseTimer != null) {
    window.clearTimeout(releaseTimer);
    releaseTimers.delete(key);
  }

  const had = activeUuids.has(key);
  if (active) {
    if (had) return;
    activeUuids.add(key);
    scheduleEmit();
    return;
  }

  if (!had) return;
  releaseTimers.set(
    key,
    window.setTimeout(() => {
      releaseTimers.delete(key);
      if (!activeUuids.delete(key)) return;
      scheduleEmit();
    }, ACTIVE_SCOPE_RELEASE_DELAY_MS),
  );
}

export function subscribeHomepagePingScope(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getHomepagePingScopeSnapshot() {
  return cachedSnapshot;
}
