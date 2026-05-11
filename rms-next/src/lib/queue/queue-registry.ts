import { Queue } from "bullmq";

import { getQueueConnectionOptions } from "@/lib/queue/redis";

/**
 * Phase 4 / Phase 7 - shared, long-lived `Queue` instances per process.
 *
 * Before this module, every enqueue site called `new Queue(name, ...)` which
 * opened a fresh ioredis connection on each request. Under load that path
 * was directly observable in `enqueue_ms` latency clusters and was the most
 * likely Redis-side contributor to the 10-13s TTFB clusters.
 *
 * The contract:
 *
 *   - One `Queue` instance per queue name, lazily constructed.
 *   - `closeAllQueues()` is exposed for graceful shutdown.
 *   - Workers continue to instantiate their own `Worker(...)`; this module
 *     is only for the producer side.
 */

const queueByName = new Map<string, Queue>();

export function getSharedQueue<T = unknown>(name: string): Queue<T> {
  const existing = queueByName.get(name);
  if (existing) {
    return existing as Queue<T>;
  }
  const created = new Queue<T>(name, {
    connection: getQueueConnectionOptions(),
  });
  queueByName.set(name, created);
  return created;
}

export async function closeAllQueues(): Promise<void> {
  const all = Array.from(queueByName.values());
  queueByName.clear();
  await Promise.allSettled(all.map((q) => q.close()));
}
