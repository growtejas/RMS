type Entry<T> = { value: T; expiresAt: number };

/**
 * Small in-process TTL cache (per Node instance).
 * Intended for low-risk dashboards/metrics to reduce repeated DB load.
 */
export class TtlCache<K, V> {
  private store = new Map<K, Entry<V>>();

  get(key: K): V | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() >= e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return e.value;
  }

  set(key: K, value: V, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

