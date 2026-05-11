import { loadEnvConfig } from "@next/env";
import { Worker } from "bullmq";
import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { log } from "@/lib/logging/logger";
import { getQueueConnectionOptions } from "@/lib/queue/redis";
import {
  REPORT_AGG_JOB,
  REPORT_AGG_QUEUE_NAME,
  type ReportAggregationJobPayload,
} from "@/lib/queue/report-aggregation-queue";

loadEnvConfig(process.cwd());

const worker = new Worker<ReportAggregationJobPayload>(
  REPORT_AGG_QUEUE_NAME,
  async (job) => {
    if (job.name !== REPORT_AGG_JOB) return;
    const db = getDb();
    const orgId = job.data.organizationId;
    const metricDate = job.data.date ?? new Date().toISOString().slice(0, 10);
    const snapshotKey = `daily:${metricDate}`;
    await db.execute(sql`
      insert into report_snapshots (organization_id, snapshot_key, payload, expires_at)
      values (${orgId}, ${snapshotKey}, ${JSON.stringify({ status: "queued" })}::jsonb, now() + interval '1 hour')
      on conflict (organization_id, snapshot_key)
      do update set payload = excluded.payload, generated_at = now(), expires_at = excluded.expires_at
    `);
    log("info", "report_aggregation_completed", { organization_id: orgId, metric_date: metricDate });
  },
  {
    connection: getQueueConnectionOptions(),
    concurrency: 1,
    lockDuration: 10 * 60_000,
  },
);

worker.on("failed", (job, err) => {
  log("error", "report_aggregation_worker_failed", {
    job_id: job?.id,
    error: err instanceof Error ? err.message : String(err),
  });
});
