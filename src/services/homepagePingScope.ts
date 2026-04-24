type Listener = () => void;

const activeUuids = new Set<string>();
const listeners = new Set<Listener>();
let cachedSnapshot: string[] = [];

function emit() {
  cachedSnapshot = Array.from(activeUuids).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  for (const listener of listeners) {
    listener();
  }
}

export function setHomepagePingActive(uuid: string, active: boolean) {
  const key = uuid.trim();
  if (!key) return;

  const had = activeUuids.has(key);
  if (active) {
    if (had) return;
    activeUuids.add(key);
    emit();
    return;
  }

  if (!had) return;
  activeUuids.delete(key);
  emit();
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
