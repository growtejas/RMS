/**
 * Worker: Candidate Intelligence Engine (async reports).
 * Run: `npm run worker:cie-intelligence`
 */
import { Worker } from "bullmq";
import { loadEnvConfig } from "@next/env";

import { getQueueConnectionOptions } from "@/lib/queue/redis";
import {
  CIE_INTELLIGENCE_QUEUE_NAME,
  PROCESS_CIE_CANDIDATE_JOB,
  type CieIntelligenceJobPayload,
} from "@/lib/queue/cie-intelligence-queue";
import { processCieCandidateJob } from "@/lib/services/cie/candidate-intelligence-service";
import { log } from "@/lib/logging/logger";

loadEnvConfig(process.cwd());

const worker = new Worker<CieIntelligenceJobPayload>(
  CIE_INTELLIGENCE_QUEUE_NAME,
  async (job) => {
    if (job.name !== PROCESS_CIE_CANDIDATE_JOB) {
      return;
    }
    const r = await processCieCandidateJob(job.data);
    log("info", "cie_worker_done", {
      job_id: job.id,
      candidate_id: job.data.candidateId,
      outcome: r.outcome,
    });
  },
  {
    connection: getQueueConnectionOptions(),
    concurrency: 3,
  },
);

worker.on("failed", (job, err) => {
  log("error", "cie_worker_job_failed", {
    job_id: job?.id,
    candidate_id: job?.data?.candidateId,
    error: err instanceof Error ? err.message : String(err),
  });
});

log("info", "cie_worker_started", {
  queue: CIE_INTELLIGENCE_QUEUE_NAME,
  job: PROCESS_CIE_CANDIDATE_JOB,
});
