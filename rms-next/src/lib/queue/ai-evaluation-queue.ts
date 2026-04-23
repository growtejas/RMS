import { Queue, type JobsOptions } from "bullmq";

import { log } from "@/lib/logging/logger";
import { getQueueConnectionOptions } from "@/lib/queue/redis";

export const AI_EVALUATION_QUEUE_NAME = "ai-evaluation";
export const PROCESS_AI_EVALUATION_JOB = "process-ai-evaluation";

export type AiEvaluationJobPayload = {
  organizationId: string;
  itemId: number;
  candidateId: number;
};

const jobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: 200,
  removeOnFail: 500,
};

function getQueue(): Queue<AiEvaluationJobPayload> {
  return new Queue<AiEvaluationJobPayload>(AI_EVALUATION_QUEUE_NAME, {
    connection: getQueueConnectionOptions(),
  });
}

export async function enqueueAiEvaluationJob(payload: AiEvaluationJobPayload): Promise<void> {
  const q = getQueue();
  // De-dupe: do not enqueue if an identical job is already waiting/active/delayed.
  // BullMQ guarantees jobId uniqueness per queue.
  const jobId = `${payload.itemId}\0${payload.candidateId}`;
  await q.add(PROCESS_AI_EVALUATION_JOB, payload, { ...jobOptions, jobId });
  log("info", "ai_eval_job_enqueued", {
    requisition_item_id: payload.itemId,
    candidate_id: payload.candidateId,
    job_id: jobId,
  });
}

