import { Queue, type JobsOptions } from "bullmq";

import { getQueueConnectionOptions } from "@/lib/queue/redis";

export const BULK_IMPORT_QUEUE_NAME = "bulk-import";
export const PROCESS_BULK_IMPORT_JOB = "process-bulk-import";

export type BulkImportJobPayload = {
  bulkJobId: string;
};

let queue: Queue<BulkImportJobPayload> | null = null;

function getQueue(): Queue<BulkImportJobPayload> {
  if (!queue) {
    queue = new Queue<BulkImportJobPayload>(BULK_IMPORT_QUEUE_NAME, {
      connection: getQueueConnectionOptions(),
    });
  }
  return queue;
}

export async function enqueueBulkImportJob(
  bulkJobId: string,
  opts?: JobsOptions,
): Promise<void> {
  const q = getQueue();
  await q.add(
    PROCESS_BULK_IMPORT_JOB,
    { bulkJobId },
    { removeOnComplete: 100, removeOnFail: 50, ...opts },
  );
}
