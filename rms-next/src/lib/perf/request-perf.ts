import { AsyncLocalStorage } from "node:async_hooks";

import { log } from "@/lib/logging/logger";

/**
 * Per-request timing buckets recorded by lower-level instrumentation
 * (auth fast path, DB factories, queue clients). Each bucket sums all
 * occurrences in the request lifecycle so we can attribute end-to-end
 * latency to its real source instead of the body of the route handler.
 */
type PerfStore = {
  route: string;
  startedAt: number;
  dbQueryCount: number;
  /** Cumulative milliseconds spent inside named sub-steps (auth/db/queue). */
  buckets: Record<string, number>;
  /** Free-form scalar tags (e.g. auth_path: "claims" | "db"). */
  tags: Record<string, string | number | boolean>;
};

const perfStorage = new AsyncLocalStorage<PerfStore>();

function nowMs(): number {
  return Number(process.hrtime.bigint() / 1000000n);
}

export async function withRequestPerf<T>(
  route: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>,
): Promise<T> {
  const startedAt = nowMs();
  return await perfStorage.run(
    { route, startedAt, dbQueryCount: 0, buckets: {}, tags: {} },
    async () => {
      try {
        return await fn();
      } finally {
        const store = perfStorage.getStore();
        const durationMs = nowMs() - startedAt;
        log("info", "perf_request_summary", {
          route,
          duration_ms: durationMs,
          db_query_count: store?.dbQueryCount ?? 0,
          ...(store?.buckets ?? {}),
          ...(store?.tags ?? {}),
          ...(extra ?? {}),
        });
      }
    },
  );
}

export function noteDbQuery(): void {
  const store = perfStorage.getStore();
  if (!store) {
    return;
  }
  store.dbQueryCount += 1;
}

/**
 * Add `ms` to a named timing bucket on the current request. Buckets are
 * merged into the `perf_request_summary` log line, e.g. `auth_ms_jwt: 4`,
 * `auth_ms_user_db: 28`, `queue_ms_enqueue: 6`.
 */
export function notePerfMs(bucket: string, ms: number): void {
  const store = perfStorage.getStore();
  if (!store) {
    return;
  }
  store.buckets[bucket] = (store.buckets[bucket] ?? 0) + Math.max(0, ms);
}

/** Tag the current request with a small scalar for log attribution. */
export function notePerfTag(
  key: string,
  value: string | number | boolean,
): void {
  const store = perfStorage.getStore();
  if (!store) {
    return;
  }
  store.tags[key] = value;
}

/**
 * Time `fn` and record its elapsed ms under the named bucket. Returns the
 * function's return value untouched, so call sites stay readable.
 */
export async function timePerf<T>(
  bucket: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = nowMs();
  try {
    return await fn();
  } finally {
    notePerfMs(bucket, nowMs() - start);
  }
}

export function estimateJsonBytes(payload: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload), "utf8");
  } catch {
    return -1;
  }
}
