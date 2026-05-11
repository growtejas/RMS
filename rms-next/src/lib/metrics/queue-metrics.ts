import { Gauge, Registry, collectDefaultMetrics } from "prom-client";

import { log } from "@/lib/logging/logger";
import { QUEUE_POLICIES } from "@/lib/queue/queue-policies";
import { getSharedQueue } from "@/lib/queue/queue-registry";

/**
 * Phase 8 - BullMQ + Node process metrics in Prometheus format.
 *
 * One `Registry` per process. The exporter is the `/api/metrics` route;
 * scrape from your Prometheus / OTel collector. The cost of a scrape is
 * a `getJobCounts()` call per queue (single Redis round trip) plus the
 * default Node metrics, so the scrape itself stays well under the 100ms
 * budget even at 8 queues.
 */

let registry: Registry | null = null;
let queueDepthGauge: Gauge<string> | null = null;
let queueActiveGauge: Gauge<string> | null = null;
let queueFailedGauge: Gauge<string> | null = null;
let queueDelayedGauge: Gauge<string> | null = null;
let queueWaitingGauge: Gauge<string> | null = null;

function ensureRegistry(): Registry {
  if (registry) return registry;
  registry = new Registry();
  collectDefaultMetrics({ register: registry });

  queueDepthGauge = new Gauge({
    name: "rms_queue_total_jobs",
    help: "Total jobs across waiting + active + delayed for a BullMQ queue",
    labelNames: ["queue"] as const,
    registers: [registry],
  });
  queueActiveGauge = new Gauge({
    name: "rms_queue_active_jobs",
    help: "Currently in-flight BullMQ jobs",
    labelNames: ["queue"] as const,
    registers: [registry],
  });
  queueFailedGauge = new Gauge({
    name: "rms_queue_failed_jobs",
    help: "BullMQ jobs in failed state",
    labelNames: ["queue"] as const,
    registers: [registry],
  });
  queueDelayedGauge = new Gauge({
    name: "rms_queue_delayed_jobs",
    help: "BullMQ jobs scheduled in the future",
    labelNames: ["queue"] as const,
    registers: [registry],
  });
  queueWaitingGauge = new Gauge({
    name: "rms_queue_waiting_jobs",
    help: "BullMQ jobs waiting to be picked up",
    labelNames: ["queue"] as const,
    registers: [registry],
  });
  return registry;
}

export async function renderQueueMetricsAsPrometheusText(): Promise<string> {
  const reg = ensureRegistry();
  const queueNames = Object.keys(QUEUE_POLICIES) as (keyof typeof QUEUE_POLICIES)[];
  await Promise.all(
    queueNames.map(async (name) => {
      try {
        const q = getSharedQueue(name);
        const counts = await q.getJobCounts(
          "waiting",
          "active",
          "delayed",
          "failed",
        );
        const waiting = counts.waiting ?? 0;
        const active = counts.active ?? 0;
        const delayed = counts.delayed ?? 0;
        const failed = counts.failed ?? 0;
        queueWaitingGauge?.set({ queue: name }, waiting);
        queueActiveGauge?.set({ queue: name }, active);
        queueDelayedGauge?.set({ queue: name }, delayed);
        queueFailedGauge?.set({ queue: name }, failed);
        queueDepthGauge?.set({ queue: name }, waiting + active + delayed);
      } catch (e) {
        log("warn", "queue_metrics_scrape_failed", {
          queue: name,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );
  return reg.metrics();
}

export function getMetricsContentType(): string {
  return ensureRegistry().contentType;
}
