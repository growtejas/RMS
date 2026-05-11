import type { JobsOptions } from "bullmq";

/**
 * Phase 7 - explicit queue policies in one place.
 *
 * The platform invariants:
 *
 *   - Each queue declares its own `concurrency`, `lockDuration`,
 *     `removeOnComplete`, `removeOnFail`. Defaults are intentionally
 *     conservative: a hot loop in one queue cannot saturate the worker
 *     fleet for another.
 *
 *   - Priority lanes match the recruiter-visibility cost of the work:
 *
 *       High lane    -> notifications (recruiter waiting on confirmation).
 *       Default lane -> ai-evaluation, ranking refresh.
 *       Low lane     -> cie-intelligence, resume-structure, bulk-import.
 *
 *   - Repeat jobs (`ai-eval-backfill`, `lifecycle-reminders`) live on a
 *     single dedicated worker process to prevent duplicate scheduling
 *     across pods.
 */

export const QUEUE_PRIORITY = {
  HIGH: 1,
  DEFAULT: 5,
  LOW: 10,
} as const;

export type QueuePolicy = {
  concurrency: number;
  lockDuration: number;
  removeOnComplete: number;
  removeOnFail: number;
  priority: number;
  /** Whether the queue runs on the dedicated repeat-job worker. */
  repeatOnly?: boolean;
};

export const QUEUE_POLICIES = {
  "notification-delivery": {
    concurrency: 4,
    lockDuration: 60_000,
    removeOnComplete: 100,
    removeOnFail: 40,
    priority: QUEUE_PRIORITY.HIGH,
  },
  "ai-evaluation": {
    concurrency: 4,
    lockDuration: 5 * 60_000,
    removeOnComplete: 200,
    removeOnFail: 500,
    priority: QUEUE_PRIORITY.DEFAULT,
  },
  "ai-eval-backfill": {
    concurrency: 1,
    lockDuration: 60_000,
    removeOnComplete: 50,
    removeOnFail: 100,
    priority: QUEUE_PRIORITY.DEFAULT,
    repeatOnly: true,
  },
  "lifecycle-reminders": {
    concurrency: 2,
    lockDuration: 60_000,
    removeOnComplete: 100,
    removeOnFail: 30,
    priority: QUEUE_PRIORITY.DEFAULT,
    repeatOnly: true,
  },
  "cie-intelligence": {
    concurrency: 2,
    lockDuration: 10 * 60_000,
    removeOnComplete: 200,
    removeOnFail: 500,
    priority: QUEUE_PRIORITY.LOW,
  },
  "resume-structure": {
    concurrency: 2,
    lockDuration: 5 * 60_000,
    removeOnComplete: 200,
    removeOnFail: 100,
    priority: QUEUE_PRIORITY.LOW,
  },
  "bulk-import": {
    concurrency: 1,
    lockDuration: 30 * 60_000,
    removeOnComplete: 100,
    removeOnFail: 50,
    priority: QUEUE_PRIORITY.LOW,
  },
  "inbound-events": {
    concurrency: 4,
    lockDuration: 5 * 60_000,
    removeOnComplete: 200,
    removeOnFail: 500,
    priority: QUEUE_PRIORITY.DEFAULT,
  },
  "report-aggregation": {
    concurrency: 1,
    lockDuration: 10 * 60_000,
    removeOnComplete: 60,
    removeOnFail: 120,
    priority: QUEUE_PRIORITY.LOW,
    repeatOnly: true,
  },
} as const satisfies Record<string, QueuePolicy>;

export type KnownQueueName = keyof typeof QUEUE_POLICIES;

export function getQueuePolicy(name: KnownQueueName): QueuePolicy {
  return QUEUE_POLICIES[name];
}

/**
 * Build a `JobsOptions` template from a queue policy. Use as the base for
 * any `Queue.add()` / `Queue.addBulk()` call so retention + priority are
 * guaranteed regardless of the call site.
 */
export function jobOptionsFor(name: KnownQueueName): JobsOptions {
  const p = QUEUE_POLICIES[name];
  return {
    priority: p.priority,
    removeOnComplete: p.removeOnComplete,
    removeOnFail: p.removeOnFail,
  };
}
