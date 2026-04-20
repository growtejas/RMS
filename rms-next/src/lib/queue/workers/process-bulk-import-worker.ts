/**
 * Worker: process bulk import jobs (`bulk_import_jobs` table).
 * Run: `npm run worker:bulk-import`
 */
import { Worker } from "bullmq";

import { getDb } from "@/lib/db";
import { bulkImportJobs } from "@/lib/db/schema";
import {
  BULK_IMPORT_QUEUE_NAME,
  PROCESS_BULK_IMPORT_JOB,
  type BulkImportJobPayload,
} from "@/lib/queue/bulk-import-queue";
import { getQueueConnectionOptions } from "@/lib/queue/redis";
import { eq } from "drizzle-orm";

async function runJob(data: BulkImportJobPayload): Promise<void> {
  const db = getDb();
  await db
    .update(bulkImportJobs)
    .set({
      status: "running",
      updatedAt: new Date(),
    })
    .where(eq(bulkImportJobs.id, data.bulkJobId));

  // Placeholder: wire CSV/row iteration + candidate upserts per org.
  await db
    .update(bulkImportJobs)
    .set({
      status: "completed",
      resultSummary: { processed: 0, message: "stub complete" },
      updatedAt: new Date(),
    })
    .where(eq(bulkImportJobs.id, data.bulkJobId));
}

const worker = new Worker<BulkImportJobPayload>(
  BULK_IMPORT_QUEUE_NAME,
  async (job) => {
    if (job.name !== PROCESS_BULK_IMPORT_JOB) {
      return;
    }
    await runJob(job.data);
  },
  { connection: getQueueConnectionOptions() },
);

worker.on("failed", (job, err) => {
  console.error("[bulk-import] job failed", job?.id, err);
});

console.log("Bulk import worker listening…");
