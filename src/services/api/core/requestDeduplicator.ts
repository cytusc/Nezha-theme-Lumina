interface PendingRequest {
  promise: Promise<unknown>;
  timestamp: number;
  callers: number;
}

interface CooldownEntry {
  result: unknown;
  expiresAt: number;
}

class RequestDeduplicator {
  private pending = new Map<string, PendingRequest>();
  private cooldown = new Map<string, CooldownEntry>();
  private readonly COOLDOWN_MS = 1000;

  async deduplicate<T>(
    key: string,
    requestFn: () => Promise<T>,
    options?: { forceRefresh?: boolean },
  ): Promise<T> {
    if (!options?.forceRefresh) {
      const cooldownEntry = this.cooldown.get(key);
      if (cooldownEntry && cooldownEntry.expiresAt > Date.now()) {
        return cooldownEntry.result as T;
      }

      const existing = this.pending.get(key);
      if (existing) {
        existing.callers++;
        return existing.promise as Promise<T>;
      }
    }

    const promise = requestFn()
      .then((result) => {
        this.cooldown.set(key, {
          result,
          expiresAt: Date.now() + this.COOLDOWN_MS,
        });
        return result;
      })
      .finally(() => {
        const pending = this.pending.get(key);
        if (pending && pending.callers <= 1) {
          this.pending.delete(key);
        } else if (pending) {
          pending.callers--;
        }
      });

    this.pending.set(key, {
      promise,
      timestamp: Date.now(),
      callers: 1,
    });

    return promise as Promise<T>;
  }

  clear(): void {
    this.pending.clear();
    this.cooldown.clear();
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  getCooldownCount(): number {
    return this.cooldown.size;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cooldown) {
      if (entry.expiresAt <= now) {
        this.cooldown.delete(key);
      }
    }
  }
}

const requestDeduplicator = new RequestDeduplicator();

if (typeof window !== "undefined") {
  setInterval(() => requestDeduplicator.cleanup(), 30_000);
}

export { RequestDeduplicator, requestDeduplicator };
