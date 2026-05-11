import type { JobsOptions, Queue } from "bullmq";

import { jobOptionsFor } from "@/lib/queue/queue-policies";
import { getSharedQueue } from "@/lib/queue/queue-registry";

export const RESUME_STRUCTURE_QUEUE_NAME = "resume-structure";
export const REFINE_RESUME_STRUCTURE_JOB = "refine-resume-structure";

export type RefineResumeStructurePayload = {
  candidateId: number;
};

function getQueue(): Queue<RefineResumeStructurePayload> {
  return getSharedQueue<RefineResumeStructurePayload>(
    RESUME_STRUCTURE_QUEUE_NAME,
  );
}

export async function enqueueResumeStructureRefineJob(
  candidateId: number,
  opts?: JobsOptions,
): Promise<void> {
  const q = getQueue();
  await q.add(
    REFINE_RESUME_STRUCTURE_JOB,
    { candidateId },
    { ...jobOptionsFor("resume-structure"), ...opts },
  );
}
