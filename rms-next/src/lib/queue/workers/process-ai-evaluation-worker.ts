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
import { executeAiEvaluationsForItem } from "@/lib/services/ai-evaluation/ai-evaluation-service";
import { log } from "@/lib/logging/logger";

loadEnvConfig(process.cwd());

const worker = new Worker<AiEvaluationJobPayload>(
  AI_EVALUATION_QUEUE_NAME,
  async (job) => {
    const { organizationId, itemId, candidateId } = job.data;
    log("info", "ai_eval_worker_processing_job", {
      job_id: job.id,
      requisition_item_id: itemId,
      candidate_id: candidateId,
    });
    await executeAiEvaluationsForItem({
      organizationId,
      itemId,
      candidateIds: [candidateId],
      force: false,
      includeEvalInput: false,
    });
  },
  { connection: getQueueConnectionOptions() },
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

