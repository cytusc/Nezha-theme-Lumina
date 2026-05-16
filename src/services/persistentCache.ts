import { get, set, del, entries } from "idb-keyval";

interface CachedEntry<T> {
  data: T;
  timestamp: number;
  version: number;
}

const CACHE_VERSION = 1;
const BOOTSTRAP_KEY = "lumina:home-bootstrap";
const SNAPSHOT_KEY = "lumina:home-snapshot";
const PING_KEY = "lumina:home-ping";
const BOOTSTRAP_TTL = 5 * 60_000;
const SNAPSHOT_TTL = 5 * 60_000;
const PING_TTL = 30 * 60_000;

async function readCache<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const entry = await get<CachedEntry<T>>(key);
    if (!entry || entry.version !== CACHE_VERSION) {
      await del(key);
      return null;
    }
    if (Date.now() - entry.timestamp > ttlMs) {
      await del(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    await set(key, { data, timestamp: Date.now(), version: CACHE_VERSION });
  } catch {
    // IndexedDB 写入失败不影响功能
  }
}

export async function readBootstrapCache<T>(): Promise<T | null> {
  return readCache<T>(BOOTSTRAP_KEY, BOOTSTRAP_TTL);
}

export async function writeBootstrapCache<T>(data: T): Promise<void> {
  return writeCache(BOOTSTRAP_KEY, data);
}

export async function readSnapshotCache<T>(): Promise<T | null> {
  return readCache<T>(SNAPSHOT_KEY, SNAPSHOT_TTL);
}

export async function writeSnapshotCache<T>(data: T): Promise<void> {
  return writeCache(SNAPSHOT_KEY, data);
}

export async function readPingCache<T>(): Promise<T | null> {
  return readCache<T>(PING_KEY, PING_TTL);
}

export async function writePingCache<T>(data: T): Promise<void> {
  return writeCache(PING_KEY, data);
}

export async function clearAllCache(): Promise<void> {
  try {
    const all = await entries();
    for (const [key] of all) {
      if (String(key).startsWith("lumina:")) {
        await del(key);
      }
    }
  } catch {
    // 忽略清理错误
  }
}
