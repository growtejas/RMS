import { Queue, type JobsOptions } from "bullmq";

import { getQueueConnectionOptions } from "@/lib/queue/redis";

export const INBOUND_EVENTS_QUEUE_NAME = "inbound-events";
export const PROCESS_EVENT_JOB_NAME = "process-event";
export const NORMALIZE_DATA_JOB_NAME = "normalize-data";
export const PARSE_RESUME_JOB_NAME = "parse-resume";
export const DEDUPLICATE_JOB_NAME = "deduplicate";
export const PERSIST_CANDIDATE_JOB_NAME = "persist-candidate";

export type NormalizedInboundCandidate = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  /** Optional employer / current org from payload (public apply extensions). */
  currentCompany: string | null;
  resumeUrl: string | null;
  source: string;
  externalId: string;
  jobSlug: string | null;
};

export type DeduplicateDecisionMode =
  | "strict-email"
  | "soft-phone"
  | "soft-name"
  | "soft-name-company"
  | "none";

export type DeduplicateDecision = {
  mode: DeduplicateDecisionMode;
  isDuplicate: boolean;
  matchedCandidateId: number | null;
  reason: string;
  /** Probable same person on the same job line (different email); still persisted for traceability. */
  requiresReview: boolean;
  reviewReasons: string[];
  probableMatchCandidateIds: number[];
};

export type ParsedResumeArtifact = {
  parserProvider: string;
  parserVersion: string;
  status: "processed" | "failed" | "skipped";
  sourceResumeRef: string | null;
  rawText: string | null;
  parsedData: Record<string, unknown>;
  errorMessage: string | null;
};

export type ProcessInboundEventJobData = {
  inboundEventId: number;
};
export type NormalizeInboundEventJobData = {
  inboundEventId: number;
};
export type DeduplicateInboundEventJobData = {
  inboundEventId: number;
  normalizedCandidate: NormalizedInboundCandidate;
  parsedResumeArtifact: ParsedResumeArtifact;
};
export type PersistInboundEventJobData = {
  inboundEventId: number;
  normalizedCandidate: NormalizedInboundCandidate;
  parsedResumeArtifact: ParsedResumeArtifact;
  deduplicateDecision: DeduplicateDecision;
};
export type ParseResumeInboundEventJobData = {
  inboundEventId: number;
  normalizedCandidate: NormalizedInboundCandidate;
};

export type InboundEventsJobData =
  | ProcessInboundEventJobData
  | NormalizeInboundEventJobData
  | ParseResumeInboundEventJobData
  | DeduplicateInboundEventJobData
  | PersistInboundEventJobData;

const processEventJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  removeOnComplete: 200,
  removeOnFail: 500,
};

const normalizeDataJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: 200,
  removeOnFail: 500,
};

const deduplicateJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: 200,
  removeOnFail: 500,
};

const parseResumeJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1200,
  },
  removeOnComplete: 200,
  removeOnFail: 500,
};

const persistCandidateJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: 200,
  removeOnFail: 500,
};

let inboundEventsQueue: Queue<InboundEventsJobData> | null = null;

export function getInboundEventsQueue(): Queue<InboundEventsJobData> {
  if (!inboundEventsQueue) {
    inboundEventsQueue = new Queue<InboundEventsJobData>(INBOUND_EVENTS_QUEUE_NAME, {
      connection: getQueueConnectionOptions(),
    });
  }
  return inboundEventsQueue;
}

export async function enqueueProcessInboundEventJob(inboundEventId: number): Promise<void> {
  const queue = getInboundEventsQueue();
  await queue.add(
    PROCESS_EVENT_JOB_NAME,
    { inboundEventId },
    {
      ...processEventJobOptions,
      jobId: `inbound-event-${inboundEventId}`,
    },
  );
}

export async function enqueueNormalizeInboundEventJob(inboundEventId: number): Promise<void> {
  const queue = getInboundEventsQueue();
  await queue.add(
    NORMALIZE_DATA_JOB_NAME,
    { inboundEventId },
    {
      ...normalizeDataJobOptions,
      jobId: `normalize-inbound-event-${inboundEventId}`,
    },
  );
}

export async function enqueueDeduplicateInboundEventJob(params: {
  inboundEventId: number;
  normalizedCandidate: NormalizedInboundCandidate;
  parsedResumeArtifact: ParsedResumeArtifact;
}): Promise<void> {
  const queue = getInboundEventsQueue();
  await queue.add(
    DEDUPLICATE_JOB_NAME,
    {
      inboundEventId: params.inboundEventId,
      normalizedCandidate: params.normalizedCandidate,
      parsedResumeArtifact: params.parsedResumeArtifact,
    },
    {
      ...deduplicateJobOptions,
      jobId: `deduplicate-inbound-event-${params.inboundEventId}`,
    },
  );
}

export async function enqueueParseResumeInboundEventJob(params: {
  inboundEventId: number;
  normalizedCandidate: NormalizedInboundCandidate;
}): Promise<void> {
  const queue = getInboundEventsQueue();
  await queue.add(
    PARSE_RESUME_JOB_NAME,
    {
      inboundEventId: params.inboundEventId,
      normalizedCandidate: params.normalizedCandidate,
    },
    {
      ...parseResumeJobOptions,
      jobId: `parse-resume-inbound-event-${params.inboundEventId}`,
    },
  );
}

export async function enqueuePersistInboundEventJob(params: {
  inboundEventId: number;
  normalizedCandidate: NormalizedInboundCandidate;
  parsedResumeArtifact: ParsedResumeArtifact;
  deduplicateDecision: DeduplicateDecision;
}): Promise<void> {
  const queue = getInboundEventsQueue();
  await queue.add(
    PERSIST_CANDIDATE_JOB_NAME,
    {
      inboundEventId: params.inboundEventId,
      normalizedCandidate: params.normalizedCandidate,
      parsedResumeArtifact: params.parsedResumeArtifact,
      deduplicateDecision: params.deduplicateDecision,
    },
    {
      ...persistCandidateJobOptions,
      jobId: `persist-inbound-event-${params.inboundEventId}`,
    },
  );
}
