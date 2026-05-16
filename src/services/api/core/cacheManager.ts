enum CacheTier {
  REALTIME = 5_000,
  FREQUENT = 15_000,
  MODERATE = 30_000,
  STABLE = 120_000,
  STATIC = 600_000,
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  byTier: Record<string, { hits: number; misses: number; size: number }>;
}

class SmartCacheManager {
  private cache = new Map<string, CacheEntry<unknown>>();
  private tierMap = new Map<string, CacheTier>();
  private stats = { hits: 0, misses: 0 };
  private tierStats = new Map<string, { hits: number; misses: number }>();
  private maxSize: number;

  constructor(options?: { maxSize?: number }) {
    this.maxSize = options?.maxSize ?? 500;
  }

  async get<T>(key: string, tier: CacheTier, fetcher: () => Promise<T>): Promise<T> {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (entry && entry.expiresAt > now) {
      this.stats.hits++;
      this.recordTierHit(key, tier);
      entry.accessCount++;
      return entry.data as T;
    }

    this.stats.misses++;
    this.recordTierMiss(key, tier);

    const data = await fetcher();

    this.cache.set(key, {
      data,
      expiresAt: now + tier,
      createdAt: now,
      accessCount: 1,
    });
    this.tierMap.set(key, tier);

    this.evictIfNeeded();

    return data;
  }

  getSync<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return undefined;
    return entry.data as T;
  }

  set<T>(key: string, tier: CacheTier, data: T): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      expiresAt: now + tier,
      createdAt: now,
      accessCount: 0,
    });
    this.tierMap.set(key, tier);
    this.evictIfNeeded();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry != null && entry.expiresAt > Date.now();
  }

  invalidate(key: string): boolean {
    this.tierMap.delete(key);
    return this.cache.delete(key);
  }

  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        this.tierMap.delete(key);
        count++;
      }
    }
    return count;
  }

  prefetch<T>(keys: string[], tier: CacheTier, fetcher: (key: string) => Promise<T>): void {
    for (const key of keys) {
      const entry = this.cache.get(key);
      if (entry && entry.expiresAt > Date.now() + tier * 0.5) continue;
      fetcher(key)
        .then((data) => {
          this.set(key, tier, data);
        })
        .catch(() => {});
    }
  }

  getStats(): CacheStats {
    const byTier: Record<string, { hits: number; misses: number; size: number }> = {};
    const tierSizes = new Map<string, number>();

    for (const [, tier] of this.tierMap) {
      const tierName = CacheTier[tier] ?? String(tier);
      if (!tierSizes.has(tierName)) tierSizes.set(tierName, 0);
      tierSizes.set(tierName, (tierSizes.get(tierName) ?? 0) + 1);
    }

    for (const [tierName, tierStats] of this.tierStats) {
      byTier[tierName] = {
        ...tierStats,
        size: tierSizes.get(tierName) ?? 0,
      };
    }

    for (const [tierName, size] of tierSizes) {
      if (!byTier[tierName]) {
        byTier[tierName] = { hits: 0, misses: 0, size };
      } else {
        byTier[tierName].size = size;
      }
    }

    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      size: this.cache.size,
      byTier,
    };
  }

  reset(): void {
    this.cache.clear();
    this.tierMap.clear();
    this.stats = { hits: 0, misses: 0 };
    this.tierStats.clear();
  }

  private recordTierHit(key: string, tier: CacheTier): void {
    const name = CacheTier[tier] ?? String(tier);
    const stats = this.tierStats.get(name) ?? { hits: 0, misses: 0 };
    stats.hits++;
    this.tierStats.set(name, stats);
    this.tierMap.set(key, tier);
  }

  private recordTierMiss(key: string, tier: CacheTier): void {
    const name = CacheTier[tier] ?? String(tier);
    const stats = this.tierStats.get(name) ?? { hits: 0, misses: 0 };
    stats.misses++;
    this.tierStats.set(name, stats);
    this.tierMap.set(key, tier);
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxSize) return;

    const entries = [...this.cache.entries()].sort(
      (a, b) => a[1].expiresAt - b[1].expiresAt,
    );

    const evictCount = Math.floor(this.maxSize * 0.2);
    for (let i = 0; i < evictCount && i < entries.length; i++) {
      const key = entries[i][0];
      this.cache.delete(key);
      this.tierMap.delete(key);
    }
  }
}

const cacheManager = new SmartCacheManager();

export { CacheTier, SmartCacheManager, cacheManager };
