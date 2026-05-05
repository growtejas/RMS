import { Queue, type JobsOptions } from "bullmq";

import { log } from "@/lib/logging/logger";
import { getQueueConnectionOptions } from "@/lib/queue/redis";

export const CIE_INTELLIGENCE_QUEUE_NAME = "cie-intelligence";
export const PROCESS_CIE_CANDIDATE_JOB = "process-cie-candidate";

export type CieIntelligenceJobPayload = {
  organizationId: string;
  candidateId: number;
  force: boolean;
  triggeredByUserId: number | null;
  bulkJobId: string | null;
};

const jobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: 200,
  removeOnFail: 500,
};

function getQueue(): Queue<CieIntelligenceJobPayload> {
  return new Queue<CieIntelligenceJobPayload>(CIE_INTELLIGENCE_QUEUE_NAME, {
    connection: getQueueConnectionOptions(),
  });
}

export async function enqueueCieIntelligenceJob(
  payload: CieIntelligenceJobPayload,
): Promise<void> {
  const q = getQueue();
  const jobId = `${payload.candidateId}\0${payload.bulkJobId ?? "solo"}`;
  await q.add(PROCESS_CIE_CANDIDATE_JOB, payload, { ...jobOptions, jobId });
  log("info", "cie_job_enqueued", {
    candidate_id: payload.candidateId,
    bulk_job_id: payload.bulkJobId,
    job_id: jobId,
  });
}
