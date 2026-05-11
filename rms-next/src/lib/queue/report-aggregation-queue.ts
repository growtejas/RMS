import type { Queue } from "bullmq";

import { getSharedQueue } from "@/lib/queue/queue-registry";

export const REPORT_AGG_QUEUE_NAME = "report-aggregation";
export const REPORT_AGG_JOB = "daily-rollup";

export type ReportAggregationJobPayload = {
  organizationId: string;
  date?: string;
};

export function getReportAggregationQueue(): Queue<ReportAggregationJobPayload> {
  return getSharedQueue<ReportAggregationJobPayload>(REPORT_AGG_QUEUE_NAME);
}

export async function enqueueReportAggregationJob(payload: ReportAggregationJobPayload) {
  const q = getReportAggregationQueue();
  await q.add(REPORT_AGG_JOB, payload, {
    jobId: `report-agg:${payload.organizationId}:${payload.date ?? "today"}`,
    removeOnComplete: 50,
    removeOnFail: 100,
    priority: 10,
  });
}
