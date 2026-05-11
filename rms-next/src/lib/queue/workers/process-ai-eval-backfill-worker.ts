/**
 * Worker: scan applications missing a cached AI evaluation and bulk-enqueue
 * `ai-evaluation` jobs. Replaces the per-request enqueue side-effect that
 * lived inside the ranking GET (Phase 4).
 *
 * Run: `tsx src/lib/queue/workers/process-ai-eval-backfill-worker.ts`
 */
import { Worker } from "bullmq";
import { loadEnvConfig } from "@next/env";

import { log } from "@/lib/logging/logger";
import { enqueueAiEvaluationJobsBulk } from "@/lib/queue/ai-evaluation-queue";
import {
  AI_EVAL_BACKFILL_JOB,
  AI_EVAL_BACKFILL_QUEUE_NAME,
  ensureAiEvalBackfillRepeatScheduled,
  type AiEvalBackfillJobPayload,
} from "@/lib/queue/ai-eval-backfill-queue";
import { getQueueConnectionOptions } from "@/lib/queue/redis";
import { selectApplicationsNeedingAiEval } from "@/lib/repositories/ai-evaluation-backfill";

loadEnvConfig(process.cwd());

const worker = new Worker<AiEvalBackfillJobPayload>(
  AI_EVAL_BACKFILL_QUEUE_NAME,
  async (job) => {
    const limit = Math.max(1, job.data?.scanLimit ?? 100);
    const rows = await selectApplicationsNeedingAiEval(limit);
    if (rows.length === 0) {
      log("info", "ai_eval_backfill_no_pending", { scan_limit: limit });
      return;
    }
    const payloads = rows.map((r) => ({
      organizationId: r.organizationId,
      itemId: r.requisitionItemId,
      candidateId: r.candidateId,
    }));
    const out = await enqueueAiEvaluationJobsBulk(payloads);
    log("info", "ai_eval_backfill_tick", {
      scan_limit: limit,
      candidates_found: rows.length,
      enqueued: out.enqueued,
    });
  },
  {
    connection: getQueueConnectionOptions(),
    // Phase 7: backfill is a single-instance scheduler. Higher concurrency
    // would introduce race conditions on the same scan window.
    concurrency: 1,
    lockDuration: 60_000,
  },
);

worker.on("failed", (job, err) => {
  log("error", "ai_eval_backfill_worker_job_failed", {
    job_id: job?.id,
    error: err instanceof Error ? err.message : String(err),
  });
});

ensureAiEvalBackfillRepeatScheduled()
  .then(() => {
    log("info", "ai_eval_backfill_worker_started", {
      queue: AI_EVAL_BACKFILL_QUEUE_NAME,
      job: AI_EVAL_BACKFILL_JOB,
    });
  })
  .catch((e) => {
    log("error", "ai_eval_backfill_repeat_schedule_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  });
