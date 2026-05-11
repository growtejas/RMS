/**
 * Worker: Candidate Intelligence Engine (async reports).
 * Run: `npm run worker:cie-intelligence`
 */
import { Worker } from "bullmq";
import { loadEnvConfig } from "@next/env";

import { getQueuePolicy } from "@/lib/queue/queue-policies";
import { getQueueConnectionOptions } from "@/lib/queue/redis";
import {
  CIE_INTELLIGENCE_QUEUE_NAME,
  PROCESS_CIE_CANDIDATE_JOB,
  REMATERIALIZE_CIE_CANDIDATE_JOB,
  enqueueCieIntelligenceJob,
  type CieIntelligenceJobPayload,
  type CieRematerializeJobPayload,
} from "@/lib/queue/cie-intelligence-queue";
import {
  incrementCieBulkCounter,
  materializeCandidateCieV2Snapshot,
  processCieCandidateJob,
  readCieBulkSnapshot,
} from "@/lib/services/cie/candidate-intelligence-service";
import { updateBulkImportJobSummary } from "@/lib/repositories/bulk-import-repo";
import { log } from "@/lib/logging/logger";

loadEnvConfig(process.cwd());

const worker = new Worker<CieIntelligenceJobPayload | CieRematerializeJobPayload>(
  CIE_INTELLIGENCE_QUEUE_NAME,
  async (job) => {
    if (job.name === PROCESS_CIE_CANDIDATE_JOB) {
      const data = job.data as CieIntelligenceJobPayload;
      const r = await processCieCandidateJob(data);
      log("info", "cie_worker_done", {
        job_id: job.id,
        candidate_id: data.candidateId,
        outcome: r.outcome,
      });
      return;
    }
    if (job.name === REMATERIALIZE_CIE_CANDIDATE_JOB) {
      const data = job.data as CieRematerializeJobPayload;
      const result = await materializeCandidateCieV2Snapshot({
        organizationId: data.organizationId,
        candidateId: data.candidateId,
      });
      log("info", "cie_rematerialize_done", {
        job_id: job.id,
        candidate_id: data.candidateId,
        ok: result.ok,
        reason: result.ok ? null : result.reason,
      });

      if (data.bulkJobId) {
        await incrementCieBulkCounter(data.bulkJobId, result.ok ? "ok" : "failed");
        const snap = await readCieBulkSnapshot(data.bulkJobId);
        if (snap && snap.expected > 0 && snap.processed >= snap.expected) {
          const pct = Math.round((snap.processed / snap.expected) * 100);
          await updateBulkImportJobSummary({
            id: data.bulkJobId,
            status: "completed",
            resultSummary: {
              kind: "cie_rematerialize_v2",
              expected: snap.expected,
              processed: snap.processed,
              ok: snap.ok,
              failed: snap.failed,
              skipped: snap.skipped,
              progress_pct: pct,
            },
          });
        }
      }

      if (result.ok && data.enqueueRecompute) {
        try {
          await enqueueCieIntelligenceJob({
            organizationId: data.organizationId,
            candidateId: data.candidateId,
            force: true,
            triggeredByUserId: data.triggeredByUserId,
            bulkJobId: null,
          });
        } catch (e) {
          log("warn", "cie_rematerialize_recompute_enqueue_failed", {
            candidate_id: data.candidateId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return;
    }

    // Fail loud on unknown job kinds so a stale worker process can't silently drain the queue.
    // (Common cause: code was updated but the worker process was not restarted.)
    log("error", "cie_worker_unknown_job_kind", {
      job_id: job.id,
      job_name: job.name,
    });
    throw new Error(
      `Unknown CIE job kind '${job.name}'. The worker process is likely running stale code; restart it.`,
    );
  },
  {
    connection: getQueueConnectionOptions(),
    concurrency: getQueuePolicy("cie-intelligence").concurrency,
    lockDuration: getQueuePolicy("cie-intelligence").lockDuration,
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
