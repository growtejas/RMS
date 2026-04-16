import { Worker } from "bullmq";
import { loadEnvConfig } from "@next/env";

import {
  DEDUPLICATE_JOB_NAME,
  INBOUND_EVENTS_QUEUE_NAME,
  PERSIST_CANDIDATE_JOB_NAME,
  NORMALIZE_DATA_JOB_NAME,
  PARSE_RESUME_JOB_NAME,
  PROCESS_EVENT_JOB_NAME,
  type DeduplicateInboundEventJobData,
  type InboundEventsJobData,
  type ParseResumeInboundEventJobData,
  type PersistInboundEventJobData,
} from "@/lib/queue/inbound-events-queue";
import { getQueueConnectionOptions } from "@/lib/queue/redis";
import { log, logError } from "@/lib/logging/logger";
import {
  markInboundEventFailed,
  markInboundEventRetry,
} from "@/lib/repositories/inbound-events-repo";
import {
  deduplicateInboundEvent,
  normalizeInboundEvent,
  parseResumeInboundEvent,
  persistInboundEvent,
  processInboundEvent,
} from "@/lib/services/inbound-events-processing-service";

loadEnvConfig(process.cwd());

const worker = new Worker<InboundEventsJobData>(
  INBOUND_EVENTS_QUEUE_NAME,
  async (job) => {
    const inboundEventId = job.data.inboundEventId;
    if (job.name === PROCESS_EVENT_JOB_NAME) {
      await processInboundEvent(inboundEventId);
    } else if (job.name === NORMALIZE_DATA_JOB_NAME) {
      await normalizeInboundEvent(inboundEventId);
    } else if (job.name === PARSE_RESUME_JOB_NAME) {
      const data = job.data as ParseResumeInboundEventJobData;
      await parseResumeInboundEvent({
        inboundEventId: data.inboundEventId,
        normalizedCandidate: data.normalizedCandidate,
      });
    } else if (job.name === DEDUPLICATE_JOB_NAME) {
      const data = job.data as DeduplicateInboundEventJobData;
      await deduplicateInboundEvent({
        inboundEventId: data.inboundEventId,
        normalizedCandidate: data.normalizedCandidate,
        parsedResumeArtifact: data.parsedResumeArtifact,
      });
    } else if (job.name === PERSIST_CANDIDATE_JOB_NAME) {
      const data = job.data as PersistInboundEventJobData;
      await persistInboundEvent({
        inboundEventId: data.inboundEventId,
        normalizedCandidate: data.normalizedCandidate,
        parsedResumeArtifact: data.parsedResumeArtifact,
        deduplicateDecision: data.deduplicateDecision,
      });
    } else {
      throw new Error(`Unsupported inbound-events job '${job.name}'`);
    }
    return { inboundEventId };
  },
  {
    connection: getQueueConnectionOptions(),
    concurrency: 10,
  },
);

worker.on("completed", (job) => {
  log("info", "Inbound event job completed", {
    queue: INBOUND_EVENTS_QUEUE_NAME,
    job_id: job.id,
    inbound_event_id: job.data.inboundEventId,
  });
});

worker.on("failed", async (job, err) => {
  if (!job) {
    logError("Inbound event job failed without job payload", err, {
      queue: INBOUND_EVENTS_QUEUE_NAME,
    });
    return;
  }

  const attemptsMade = job.attemptsMade;
  const attemptsAllowed = job.opts.attempts ?? 1;
  const inboundEventId =
    (job.data as { inboundEventId?: number } | undefined)?.inboundEventId ?? -1;
  const errorMessage = err?.message ?? "Unknown queue processing error";

  if (attemptsMade >= attemptsAllowed) {
    await markInboundEventFailed({
      inboundEventId,
      attemptsMade,
      errorMessage,
    });
  } else {
    await markInboundEventRetry({
      inboundEventId,
      attemptsMade,
      errorMessage,
    });
  }

  logError("Inbound event job failed", err, {
    queue: INBOUND_EVENTS_QUEUE_NAME,
    job_id: job.id,
    inbound_event_id: inboundEventId,
    attempts_made: attemptsMade,
    attempts_allowed: attemptsAllowed,
  });
});

worker.on("error", (err) => {
  logError("Inbound event worker runtime error", err, {
    queue: INBOUND_EVENTS_QUEUE_NAME,
  });
});

async function shutdown(signal: string) {
  log("info", "Shutting down inbound event worker", {
    queue: INBOUND_EVENTS_QUEUE_NAME,
    signal,
  });
  await worker.close();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

log("info", "Inbound event worker started", {
  queue: INBOUND_EVENTS_QUEUE_NAME,
});
