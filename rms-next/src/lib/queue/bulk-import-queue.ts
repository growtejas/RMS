import type { JobsOptions, Queue } from "bullmq";

import { jobOptionsFor } from "@/lib/queue/queue-policies";
import { getSharedQueue } from "@/lib/queue/queue-registry";

export const BULK_IMPORT_QUEUE_NAME = "bulk-import";
export const PROCESS_BULK_IMPORT_JOB = "process-bulk-import";

export type BulkImportJobPayload = {
  bulkJobId: string;
};

function getQueue(): Queue<BulkImportJobPayload> {
  return getSharedQueue<BulkImportJobPayload>(BULK_IMPORT_QUEUE_NAME);
}

export async function enqueueBulkImportJob(
  bulkJobId: string,
  opts?: JobsOptions,
): Promise<void> {
  const q = getQueue();
  await q.add(
    PROCESS_BULK_IMPORT_JOB,
    { bulkJobId },
    { ...jobOptionsFor("bulk-import"), ...opts },
  );
}
