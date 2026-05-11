/**
 * Single-pass aggregation primitives reused by every analytics module.
 * Replaces ad-hoc `array.filter().length` patterns that dominated the
 * Phase 1 service implementations.
 */

export function groupBy<TItem, TKey extends string | number>(
  items: readonly TItem[],
  keyFn: (item: TItem) => TKey,
): Map<TKey, TItem[]> {
  const out = new Map<TKey, TItem[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = out.get(key);
    if (arr) {
      arr.push(item);
    } else {
      out.set(key, [item]);
    }
  }
  return out;
}

export function countBy<TItem, TKey extends string | number>(
  items: readonly TItem[],
  keyFn: (item: TItem) => TKey,
): Map<TKey, number> {
  const out = new Map<TKey, number>();
  for (const item of items) {
    const key = keyFn(item);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/** Map an item array into a Map keyed by an id field; collisions keep the last value. */
export function indexBy<TItem, TKey extends string | number>(
  items: readonly TItem[],
  keyFn: (item: TItem) => TKey,
): Map<TKey, TItem> {
  const out = new Map<TKey, TItem>();
  for (const item of items) {
    out.set(keyFn(item), item);
  }
  return out;
}

/** Increment a frequency map - convenient for per-key reasons/sources/etc. */
export function incrementMap<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}
