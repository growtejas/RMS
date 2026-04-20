import { Queue, type JobsOptions } from "bullmq";

import { getQueueConnectionOptions } from "@/lib/queue/redis";

export const RESUME_STRUCTURE_QUEUE_NAME = "resume-structure";
export const REFINE_RESUME_STRUCTURE_JOB = "refine-resume-structure";

export type RefineResumeStructurePayload = {
  candidateId: number;
};

let queue: Queue<RefineResumeStructurePayload> | null = null;

function getQueue(): Queue<RefineResumeStructurePayload> {
  if (!queue) {
    queue = new Queue<RefineResumeStructurePayload>(RESUME_STRUCTURE_QUEUE_NAME, {
      connection: getQueueConnectionOptions(),
    });
  }
  return queue;
}

export async function enqueueResumeStructureRefineJob(
  candidateId: number,
  opts?: JobsOptions,
): Promise<void> {
  const q = getQueue();
  await q.add(
    REFINE_RESUME_STRUCTURE_JOB,
    { candidateId },
    { removeOnComplete: 200, removeOnFail: 100, ...opts },
  );
}
