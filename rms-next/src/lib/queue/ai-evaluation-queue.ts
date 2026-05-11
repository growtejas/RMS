import { type JobsOptions, type Queue } from "bullmq";

import { log } from "@/lib/logging/logger";
import { notePerfMs } from "@/lib/perf/request-perf";
import { getSharedQueue } from "@/lib/queue/queue-registry";
import { getSharedRedisConnection } from "@/lib/queue/redis";

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

/**
 * Singleton queue handle, shared via `queue-registry`. Avoids the
 * "new Queue() per enqueue" pattern that opened fresh BullMQ + ioredis
 * connections on every request, which was a documented contributor to
 * the 10-13s TTFB clusters under load.
 */
function getQueue(): Queue<AiEvaluationJobPayload> {
  return getSharedQueue<AiEvaluationJobPayload>(AI_EVALUATION_QUEUE_NAME);
}

function nowMs(): number {
  return Number(process.hrtime.bigint() / 1000000n);
}

function describeRedisState(): string {
  try {
    return getSharedRedisConnection().status ?? "unknown";
  } catch {
    return "unavailable";
  }
}

export async function enqueueAiEvaluationJob(
  payload: AiEvaluationJobPayload,
): Promise<void> {
  const q = getQueue();
  // De-dupe: do not enqueue if an identical job is already waiting/active/delayed.
  // BullMQ guarantees jobId uniqueness per queue.
  const jobId = `${payload.itemId}\0${payload.candidateId}`;
  const start = nowMs();
  let ok = false;
  try {
    await q.add(PROCESS_AI_EVALUATION_JOB, payload, { ...jobOptions, jobId });
    ok = true;
  } finally {
    const enqueueMs = nowMs() - start;
    notePerfMs("queue_ms_enqueue", enqueueMs);
    log("info", "ai_eval_job_enqueued", {
      requisition_item_id: payload.itemId,
      candidate_id: payload.candidateId,
      job_id: jobId,
      enqueue_ms: enqueueMs,
      redis_connect_state: describeRedisState(),
      ok,
    });
  }
}

/**
 * Bulk enqueue path used by recompute / backfill flows. Single Redis round
 * trip irrespective of payload count, so a 200-candidate snapshot stops
 * costing 200 separate `Queue.add()` awaits.
 */
export async function enqueueAiEvaluationJobsBulk(
  payloads: AiEvaluationJobPayload[],
): Promise<{ enqueued: number }> {
  if (payloads.length === 0) {
    return { enqueued: 0 };
  }
  const q = getQueue();
  const jobs = payloads.map((p) => ({
    name: PROCESS_AI_EVALUATION_JOB,
    data: p,
    opts: { ...jobOptions, jobId: `${p.itemId}\0${p.candidateId}` },
  }));
  const start = nowMs();
  let ok = false;
  let enqueued = 0;
  try {
    const added = await q.addBulk(jobs);
    enqueued = added.length;
    ok = true;
    return { enqueued };
  } finally {
    const enqueueMs = nowMs() - start;
    notePerfMs("queue_ms_enqueue", enqueueMs);
    log("info", "ai_eval_job_enqueued_bulk", {
      count_requested: payloads.length,
      count_enqueued: enqueued,
      enqueue_ms: enqueueMs,
      redis_connect_state: describeRedisState(),
      ok,
    });
  }
}

