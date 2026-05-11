import type { JobsOptions, Queue } from "bullmq";

import { log } from "@/lib/logging/logger";
import { jobOptionsFor } from "@/lib/queue/queue-policies";
import { getSharedQueue } from "@/lib/queue/queue-registry";

export const CIE_INTELLIGENCE_QUEUE_NAME = "cie-intelligence";
export const PROCESS_CIE_CANDIDATE_JOB = "process-cie-candidate";
export const REMATERIALIZE_CIE_CANDIDATE_JOB = "rematerialize-cie-candidate";

export type CieIntelligenceJobPayload = {
  organizationId: string;
  candidateId: number;
  force: boolean;
  triggeredByUserId: number | null;
  bulkJobId: string | null;
};

export type CieRematerializeJobPayload = {
  organizationId: string;
  candidateId: number;
  triggeredByUserId: number | null;
  bulkJobId: string | null;
  /** When true, also enqueue a CIE recompute right after the v2 snapshot is materialized. */
  enqueueRecompute: boolean;
};

const jobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  ...jobOptionsFor("cie-intelligence"),
};

type AnyCieJobPayload = CieIntelligenceJobPayload | CieRematerializeJobPayload;

function getQueue(): Queue<AnyCieJobPayload> {
  return getSharedQueue<AnyCieJobPayload>(CIE_INTELLIGENCE_QUEUE_NAME);
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

export async function enqueueCieRematerializeJob(
  payload: CieRematerializeJobPayload,
): Promise<void> {
  const q = getQueue();
  // BullMQ disallows ':' in custom job IDs; use the same `id\0bulk` shape as the
  // recompute job, prefixed with `rm-` so the two job kinds never collide.
  const jobId = `rm-${payload.candidateId}\0${payload.bulkJobId ?? "solo"}`;
  await q.add(REMATERIALIZE_CIE_CANDIDATE_JOB, payload, { ...jobOptions, jobId });
  log("info", "cie_rematerialize_enqueued", {
    candidate_id: payload.candidateId,
    bulk_job_id: payload.bulkJobId,
    job_id: jobId,
  });
}
