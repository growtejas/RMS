/**
 * Worker: process bulk import jobs (`bulk_import_jobs` table).
 * Run: `npm run worker:bulk-import`
 */
import { Worker } from "bullmq";
import {
  BULK_IMPORT_QUEUE_NAME,
  PROCESS_BULK_IMPORT_JOB,
  type BulkImportJobPayload,
} from "@/lib/queue/bulk-import-queue";
import { getQueueConnectionOptions } from "@/lib/queue/redis";
import { processBulkImportJob } from "@/lib/services/bulk-import-service";

const worker = new Worker<BulkImportJobPayload>(
  BULK_IMPORT_QUEUE_NAME,
  async (job) => {
    if (job.name !== PROCESS_BULK_IMPORT_JOB) {
      return;
    }
    await processBulkImportJob(job.data.bulkJobId, { onlyIfQueued: true });
  },
  { connection: getQueueConnectionOptions() },
);

worker.on("failed", (job, err) => {
  console.error("[bulk-import] job failed", job?.id, err);
});

console.log("Bulk import worker listening…");
