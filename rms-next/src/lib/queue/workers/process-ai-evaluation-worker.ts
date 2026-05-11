/**
 * Worker: process AI evaluation jobs (populate candidate_ai_evaluations cache).
 * Run: `tsx src/lib/queue/workers/process-ai-evaluation-worker.ts`
 */
import { Worker } from "bullmq";
import { loadEnvConfig } from "@next/env";

import { getQueueConnectionOptions } from "@/lib/queue/redis";
import {
  AI_EVALUATION_QUEUE_NAME,
  PROCESS_AI_EVALUATION_JOB,
  type AiEvaluationJobPayload,
} from "@/lib/queue/ai-evaluation-queue";
import {
  publishAiEvalCompleted,
  type AiEvalEventStatus,
} from "@/lib/queue/ai-evaluation-events";
import { executeAiEvaluationsForItem } from "@/lib/services/ai-evaluation/ai-evaluation-service";
import { log } from "@/lib/logging/logger";

loadEnvConfig(process.cwd());

/**
 * Phase 7 - explicit per-queue concurrency / lock / retention. Defaults
 * carried in the job options; the Worker level adds concurrency and lock
 * duration so a hot loop in one job class cannot starve recruiter traffic.
 */
const worker = new Worker<AiEvaluationJobPayload>(
  AI_EVALUATION_QUEUE_NAME,
  async (job) => {
    const { organizationId, itemId, candidateId } = job.data;
    log("info", "ai_eval_worker_processing_job", {
      job_id: job.id,
      requisition_item_id: itemId,
      candidate_id: candidateId,
    });
    const out = await executeAiEvaluationsForItem({
      organizationId,
      itemId,
      candidateIds: [candidateId],
      force: false,
      includeEvalInput: false,
    });
    const result = out.results.find((r) => r.candidate_id === candidateId);
    let status: AiEvalEventStatus = "PENDING";
    if (result?.status === "ok" || result?.status === "skipped_cache") {
      status = "OK";
    } else if (
      result?.status === "disabled" ||
      result?.status === "llm_failed" ||
      result?.status === "not_found"
    ) {
      status = "UNAVAILABLE";
    }
    // Best-effort: SSE consumers (`useAtsAiScoreStream`) update the React
    // Query cache directly; failure here only delays UI sync to the next
    // poll fallback.
    await publishAiEvalCompleted({
      itemId,
      candidateId,
      status,
      finalScore:
        typeof result?.ai_score === "number" && Number.isFinite(result.ai_score)
          ? result.ai_score
          : null,
    });
  },
  {
    connection: getQueueConnectionOptions(),
    concurrency: 4,
    lockDuration: 5 * 60 * 1000,
  },
);

worker.on("failed", (job, err) => {
  log("error", "ai_eval_worker_job_failed", {
    job_id: job?.id,
    candidate_id: job?.data?.candidateId,
    requisition_item_id: job?.data?.itemId,
    error: err instanceof Error ? err.message : String(err),
  });
});

log("info", "ai_eval_worker_started", { queue: AI_EVALUATION_QUEUE_NAME, job: PROCESS_AI_EVALUATION_JOB });

