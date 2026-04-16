import { HttpError } from "@/lib/http/http-error";
import { log } from "@/lib/logging/logger";
import {
  type DeduplicateDecision,
  type DeduplicateDecisionMode,
  type NormalizedInboundCandidate,
  type ParsedResumeArtifact,
  enqueueDeduplicateInboundEventJob,
  enqueueNormalizeInboundEventJob,
  enqueueParseResumeInboundEventJob,
  enqueuePersistInboundEventJob,
} from "@/lib/queue/inbound-events-queue";
import {
  type SoftDedupeKind,
  collectSoftDedupeMatches,
} from "@/lib/services/inbound-dedupe";
import {
  markInboundEventProcessed,
  markInboundEventProcessing,
  selectInboundEventById,
} from "@/lib/repositories/inbound-events-repo";
import { insertResumeParseArtifact } from "@/lib/repositories/resume-parse-artifacts-repo";
import { validateInboundPayloadBySource } from "@/lib/services/inbound-events-validation-service";
import { getDb } from "@/lib/db";
import { auditLog, candidates } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { parseResumeArtifact } from "@/lib/services/resume-parser-service";
import * as candidatesRepo from "@/lib/repositories/candidates-repo";
import { ensureApplicationForCandidateTx } from "@/lib/services/application-sync-service";

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toLowerEmail(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.toLowerCase();
}

function requisitionItemIdFromPayload(payload: Record<string, unknown>): string | null {
  const v =
    payload.requisition_item_id ??
    payload.requisitionItemId ??
    payload.item_id ??
    payload.job_item_id;
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(Math.trunc(v));
  }
  if (typeof v === "string") {
    return cleanString(v);
  }
  return null;
}

function normalizeInboundCandidate(event: {
  source: string;
  externalId: string;
  payload: unknown;
}): NormalizedInboundCandidate {
  const payload = event.payload as Record<string, unknown>;
  const applicant =
    payload && typeof payload.applicant === "object" && payload.applicant !== null
      ? (payload.applicant as Record<string, unknown>)
      : null;

  const fullName =
    cleanString(applicant?.full_name) ??
    cleanString(payload.full_name) ??
    cleanString(payload.fullName) ??
    cleanString(payload.candidate_name) ??
    cleanString(payload.name);

  const email = toLowerEmail(
    cleanString(applicant?.email) ??
      cleanString(payload.email) ??
      cleanString(payload.candidate_email),
  );
  const phone =
    cleanString(applicant?.phone) ??
    cleanString(payload.phone) ??
    cleanString(payload.candidate_phone);
  const resumeUrl =
    cleanString(applicant?.resume_url) ??
    cleanString(payload.resume_url) ??
    cleanString(payload.resumeUrl) ??
    cleanString(payload.resume_link);
  const jobSlug =
    cleanString(payload.job_slug) ?? requisitionItemIdFromPayload(payload);

  const currentCompany =
    cleanString(applicant?.current_company) ??
    cleanString(applicant?.currentCompany) ??
    cleanString(payload.current_company) ??
    cleanString(payload.company);

  return {
    fullName,
    email,
    phone,
    currentCompany,
    resumeUrl,
    source: event.source,
    externalId: event.externalId,
    jobSlug,
  };
}

async function deduplicateByStrictEmail(
  normalizedCandidate: NormalizedInboundCandidate,
): Promise<DeduplicateDecision> {
  if (!normalizedCandidate.email) {
    return {
      mode: "none",
      isDuplicate: false,
      matchedCandidateId: null,
      reason: "No email present in normalized payload",
      requiresReview: false,
      reviewReasons: [],
      probableMatchCandidateIds: [],
    };
  }

  const db = getDb();
  const [existing] = await db
    .select({ candidateId: candidates.candidateId })
    .from(candidates)
    .where(eq(candidates.email, normalizedCandidate.email))
    .limit(1);

  if (!existing) {
    return {
      mode: "strict-email",
      isDuplicate: false,
      matchedCandidateId: null,
      reason: "No candidate found with matching email",
      requiresReview: false,
      reviewReasons: [],
      probableMatchCandidateIds: [],
    };
  }

  return {
    mode: "strict-email",
    isDuplicate: true,
    matchedCandidateId: existing.candidateId,
    reason: "Candidate with matching email already exists",
    requiresReview: false,
    reviewReasons: [],
    probableMatchCandidateIds: [],
  };
}

/**
 * Phase 2 baseline processor:
 * validates event exists and marks the lifecycle as processed.
 * Resume parsing / normalization / persistence are added in later phases.
 */
export async function processInboundEvent(inboundEventId: number): Promise<void> {
  const event = await selectInboundEventById(inboundEventId);
  if (!event) {
    throw new HttpError(404, `Inbound event ${inboundEventId} not found`);
  }
  if (event.status === "processed") {
    return;
  }

  await markInboundEventProcessing(inboundEventId);
  validateInboundPayloadBySource({
    source: event.source,
    payload: event.payload,
  });

  // Phase 2 chain scaffold: process-event enqueues normalize-data.
  await enqueueNormalizeInboundEventJob(inboundEventId);
}

/**
 * Normalize-data job (Phase 2 scaffold): canonicalize candidate-like fields
 * and hand over to dedup stage.
 */
export async function normalizeInboundEvent(inboundEventId: number): Promise<void> {
  const event = await selectInboundEventById(inboundEventId);
  if (!event) {
    throw new HttpError(404, `Inbound event ${inboundEventId} not found`);
  }
  if (event.status !== "processing") {
    return;
  }

  const normalizedCandidate = normalizeInboundCandidate({
    source: event.source,
    externalId: event.externalId,
    payload: event.payload,
  });
  await enqueueParseResumeInboundEventJob({
    inboundEventId,
    normalizedCandidate,
  });
}

/** Parse-resume job: parse candidate resume and persist parse artifact audit row. */
export async function parseResumeInboundEvent(params: {
  inboundEventId: number;
  normalizedCandidate: NormalizedInboundCandidate;
}): Promise<void> {
  const event = await selectInboundEventById(params.inboundEventId);
  if (!event) {
    throw new HttpError(404, `Inbound event ${params.inboundEventId} not found`);
  }
  if (event.status !== "processing") {
    return;
  }

  const parsedResume = await parseResumeArtifact({
    normalizedCandidate: params.normalizedCandidate,
  });

  await insertResumeParseArtifact({
    inboundEventId: params.inboundEventId,
    artifact: parsedResume,
  });

  await enqueueDeduplicateInboundEventJob({
    inboundEventId: params.inboundEventId,
    normalizedCandidate: params.normalizedCandidate,
    parsedResumeArtifact: parsedResume,
  });
}

/** Deduplicate scaffold: strict email check against existing candidates. */
export async function deduplicateInboundEvent(params: {
  inboundEventId: number;
  normalizedCandidate: NormalizedInboundCandidate;
  parsedResumeArtifact: ParsedResumeArtifact;
}): Promise<void> {
  const event = await selectInboundEventById(params.inboundEventId);
  if (!event) {
    throw new HttpError(404, `Inbound event ${params.inboundEventId} not found`);
  }
  if (event.status !== "processing") {
    return;
  }

  const strict = await deduplicateByStrictEmail(params.normalizedCandidate);
  const itemId = parseRequisitionItemIdFromJobSlug(params.normalizedCandidate.jobSlug);
  const resolvedEmail = resolvePersistEmail(
    params.normalizedCandidate,
    params.parsedResumeArtifact,
  );
  const resolvedEmailLower = resolvedEmail ? resolvedEmail.toLowerCase() : null;

  let probableMatchCandidateIds: number[] = [];
  let reviewReasons: string[] = [];
  let strongestKind: SoftDedupeKind | null = null;

  if (!strict.isDuplicate && itemId != null) {
    const persistName = resolvePersistFullName(
      params.normalizedCandidate,
      params.parsedResumeArtifact,
    );
    const soft = await collectSoftDedupeMatches({
      requisitionItemId: itemId,
      normalized: params.normalizedCandidate,
      parsed: params.parsedResumeArtifact,
      resolvedEmailLower,
      resolvedFullName: persistName,
    });
    probableMatchCandidateIds = soft.probableIds;
    reviewReasons = soft.reasons;
    strongestKind = soft.strongestKind;
  }

  let mode: DeduplicateDecisionMode = strict.mode;
  if (!strict.isDuplicate && strongestKind === "name-company") {
    mode = "soft-name-company";
  } else if (!strict.isDuplicate && strongestKind === "phone") {
    mode = "soft-phone";
  } else if (!strict.isDuplicate && strongestKind === "name") {
    mode = "soft-name";
  }

  const requiresReview = !strict.isDuplicate && probableMatchCandidateIds.length > 0;
  const reason =
    probableMatchCandidateIds.length > 0
      ? `${strict.reason}; ${reviewReasons.join("; ")}`
      : strict.reason;

  const decision: DeduplicateDecision = {
    ...strict,
    mode,
    reason,
    requiresReview,
    reviewReasons,
    probableMatchCandidateIds,
  };

  await enqueuePersistInboundEventJob({
    inboundEventId: params.inboundEventId,
    normalizedCandidate: params.normalizedCandidate,
    parsedResumeArtifact: params.parsedResumeArtifact,
    deduplicateDecision: decision,
  });
}

function parseRequisitionItemIdFromJobSlug(jobSlug: string | null): number | null {
  const envDefault = process.env.PUBLIC_APPLY_DEFAULT_REQUISITION_ITEM_ID?.trim();
  const fromEnv = (): number | null => {
    if (envDefault && /^\d+$/.test(envDefault)) {
      return Number.parseInt(envDefault, 10);
    }
    return null;
  };

  if (!jobSlug || !jobSlug.trim()) {
    return fromEnv();
  }
  const s = jobSlug.trim();
  if (/^\d+$/.test(s)) {
    return Number.parseInt(s, 10);
  }
  const m = /^item-(\d+)$/i.exec(s);
  if (m) {
    return Number.parseInt(m[1], 10);
  }
  return fromEnv();
}

function firstEmailFromParsed(parsed: ParsedResumeArtifact): string | null {
  const emails = parsed.parsedData.emails;
  if (!Array.isArray(emails) || emails.length === 0) {
    return null;
  }
  const first = emails[0];
  if (typeof first !== "string") {
    return null;
  }
  return toLowerEmail(cleanString(first));
}

function resolvePersistEmail(
  normalized: NormalizedInboundCandidate,
  parsed: ParsedResumeArtifact,
): string | null {
  return normalized.email ?? firstEmailFromParsed(parsed);
}

function resolvePersistFullName(
  normalized: NormalizedInboundCandidate,
  parsed: ParsedResumeArtifact,
): string {
  if (normalized.fullName?.trim()) {
    return normalized.fullName.trim();
  }
  const pd = parsed.parsedData.full_name;
  if (typeof pd === "string" && pd.trim()) {
    return pd.trim().slice(0, 150);
  }
  return "Unknown applicant";
}

/**
 * Creates or updates a `candidates` row for this requisition item + email (idempotent re-ingest).
 * Resolves job target from `job_slug` (numeric item id, `item-{id}`), optional payload `requisition_item_id`,
 * or `PUBLIC_APPLY_DEFAULT_REQUISITION_ITEM_ID`.
 */
export async function persistInboundEvent(params: {
  inboundEventId: number;
  normalizedCandidate: NormalizedInboundCandidate;
  parsedResumeArtifact: ParsedResumeArtifact;
  deduplicateDecision: DeduplicateDecision;
}): Promise<void> {
  const event = await selectInboundEventById(params.inboundEventId);
  if (!event) {
    throw new HttpError(404, `Inbound event ${params.inboundEventId} not found`);
  }
  if (event.status === "processed") {
    return;
  }

  const itemId = parseRequisitionItemIdFromJobSlug(params.normalizedCandidate.jobSlug);
  if (itemId == null) {
    throw new HttpError(
      422,
      "Could not resolve requisition item: use numeric job_slug (requisition item id), " +
        "format item-{id}, set requisition_item_id on payload, or set PUBLIC_APPLY_DEFAULT_REQUISITION_ITEM_ID",
    );
  }

  const meta = await candidatesRepo.selectRequisitionItemMetaByItemId(itemId);
  if (!meta) {
    throw new HttpError(404, `Requisition item ${itemId} not found`);
  }

  const email = resolvePersistEmail(params.normalizedCandidate, params.parsedResumeArtifact);
  if (!email) {
    throw new HttpError(
      422,
      "Candidate email is required to persist (applicant email or parsed resume emails)",
    );
  }

  const fullName = resolvePersistFullName(
    params.normalizedCandidate,
    params.parsedResumeArtifact,
  );
  const phone = params.normalizedCandidate.phone?.trim() || null;
  const currentCompany =
    params.normalizedCandidate.currentCompany?.trim().slice(0, 200) || null;
  const resumePath = params.normalizedCandidate.resumeUrl?.trim() || null;
  const performedBy = meta.raisedBy;
  const probableIds = params.deduplicateDecision.probableMatchCandidateIds ?? [];
  const requiresReview = params.deduplicateDecision.requiresReview ?? false;
  const dedupeAuditHint = requiresReview
    ? ` dedupe_review=probable_match ids=[${probableIds.join(",")}]`
    : "";

  const db = getDb();
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ candidateId: candidates.candidateId, currentStage: candidates.currentStage })
      .from(candidates)
      .where(
        and(eq(candidates.requisitionItemId, itemId), eq(candidates.email, email)),
      )
      .limit(1);

    let candidateId: number;
    let candidateStage: string;
    if (existing) {
      candidateId = existing.candidateId;
      candidateStage = existing.currentStage;
      await tx
        .update(candidates)
        .set({
          fullName,
          phone,
          currentCompany,
          resumePath,
          updatedAt: new Date(),
        })
        .where(eq(candidates.candidateId, existing.candidateId));

      await tx.insert(auditLog).values({
        entityName: "candidate",
        entityId: String(candidateId),
        action: "UPDATE",
        performedBy,
        newValue:
          `Inbound ingest updated candidate (inbound_event_id=${params.inboundEventId}, source=${event.source}); dedup=${params.deduplicateDecision.mode}` +
          dedupeAuditHint,
        performedAt: new Date(),
      });
    } else {
      const [row] = await tx
        .insert(candidates)
        .values({
          requisitionItemId: itemId,
          requisitionId: meta.reqId,
          fullName,
          email,
          phone,
          currentCompany,
          resumePath,
          currentStage: "Sourced",
          addedBy: performedBy,
        })
        .returning();

      if (!row) {
        throw new HttpError(500, "Inbound candidate insert failed");
      }
      candidateId = row.candidateId;
      candidateStage = row.currentStage;

      await tx.insert(auditLog).values({
        entityName: "candidate",
        entityId: String(candidateId),
        action: "CREATE",
        performedBy,
        newValue:
          `Inbound ingest created candidate (inbound_event_id=${params.inboundEventId}, source=${event.source}, external_id=${event.externalId}); dedup=${params.deduplicateDecision.mode}` +
          dedupeAuditHint,
        performedAt: new Date(),
      });
    }

    await ensureApplicationForCandidateTx({
      tx,
      candidateId,
      requisitionItemId: itemId,
      requisitionId: meta.reqId,
      candidateStage,
      source: event.source,
      performedBy,
      reason: `Inbound sync (inbound_event_id=${params.inboundEventId}, source=${event.source})`,
      metadata: {
        source: event.source,
        inboundEventId: params.inboundEventId,
        syncMode: "inbound-persist",
      },
    });
  });

  log("info", "Inbound event persisted to candidates", {
    inbound_event_id: params.inboundEventId,
    source: event.source,
    external_id: event.externalId,
    requisition_item_id: itemId,
    deduplicate_decision: params.deduplicateDecision,
  });

  const dedupeReviewPayload = requiresReview
    ? {
        requiresReview: true,
        reviewReasons: params.deduplicateDecision.reviewReasons ?? [],
        probableMatchCandidateIds: probableIds,
        mode: params.deduplicateDecision.mode,
        evaluatedAt: new Date().toISOString(),
      }
    : undefined;

  await markInboundEventProcessed(
    params.inboundEventId,
    dedupeReviewPayload ? { dedupeReview: dedupeReviewPayload } : undefined,
  );
}
