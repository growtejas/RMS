import type { Queue } from "bullmq";

import { getSharedQueue } from "@/lib/queue/queue-registry";

export const AI_EVAL_BACKFILL_QUEUE_NAME = "ai-eval-backfill";
export const AI_EVAL_BACKFILL_JOB = "scan-and-enqueue";

export type AiEvalBackfillJobPayload = {
  /** Hard cap on jobs enqueued per scan tick. */
  scanLimit: number;
};

const DEFAULT_INTERVAL_MS = 30_000;
const REPEAT_JOB_KEY = "ai-eval-backfill-repeat";

function repeatIntervalMs(): number {
  const raw = process.env.AI_EVAL_BACKFILL_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1_000 ? n : DEFAULT_INTERVAL_MS;
}

function defaultScanLimit(): number {
  const raw = process.env.AI_EVAL_BACKFILL_SCAN_LIMIT;
  if (!raw) return 100;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export function getAiEvalBackfillQueue(): Queue<AiEvalBackfillJobPayload> {
  return getSharedQueue<AiEvalBackfillJobPayload>(
    AI_EVAL_BACKFILL_QUEUE_NAME,
  );
}

/**
 * Idempotently install the periodic backfill job. Safe to call from worker
 * boot (BullMQ deduplicates by `repeat.key`).
 */
export async function ensureAiEvalBackfillRepeatScheduled(): Promise<void> {
  if (process.env.AI_EVAL_BACKFILL_DISABLED === "true") {
    return;
  }
  const q = getAiEvalBackfillQueue();
  await q.add(
    AI_EVAL_BACKFILL_JOB,
    { scanLimit: defaultScanLimit() },
    {
      repeat: {
        every: repeatIntervalMs(),
        key: REPEAT_JOB_KEY,
      },
      jobId: REPEAT_JOB_KEY,
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );
}
