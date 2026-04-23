import type { ApiUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/http/http-error";
import * as applicationsRepo from "@/lib/repositories/applications-repo";
import * as candidatesRepo from "@/lib/repositories/candidates-repo";
import * as rankingMetadataRepo from "@/lib/repositories/ranking-metadata-repo";
import { ensureApplicationForCandidateTx } from "@/lib/services/application-sync-service";
import {
  ATS_BUCKET_KEYS,
  getAtsBucketFromFinalScore,
  getAtsBucketFromRelativeScore,
  resolveAtsBucketMode,
} from "@/lib/services/ats-buckets";
import { patchCandidateStageJson } from "@/lib/services/candidates-service";

const APPLICATION_STAGE_ORDER = [
  "Sourced",
  "Shortlisted",
  "Interviewing",
  "Offered",
  "Hired",
  "Rejected",
] as const;
const APPLICATION_STAGE_SET = new Set<string>(APPLICATION_STAGE_ORDER);

function applicationHistoryToJson(row: applicationsRepo.ApplicationStageHistoryRow) {
  return {
    history_id: row.historyId,
    application_id: row.applicationId,
    candidate_id: row.candidateId,
    from_stage: row.fromStage ?? null,
    to_stage: row.toStage,
    changed_by: row.changedBy ?? null,
    reason: row.reason ?? null,
    metadata: row.metadata ?? null,
    changed_at: row.changedAt?.toISOString() ?? null,
  };
}

function applicationToJson(row: applicationsRepo.ApplicationWithCandidateRow) {
  return {
    application_id: row.application.applicationId,
    candidate_id: row.application.candidateId,
    requisition_item_id: row.application.requisitionItemId,
    requisition_id: row.application.requisitionId,
    current_stage: row.application.currentStage,
    ats_bucket: row.application.atsBucket ?? null,
    source: row.application.source,
    created_by: row.application.createdBy ?? null,
    created_at: row.application.createdAt?.toISOString() ?? null,
    updated_at: row.application.updatedAt?.toISOString() ?? null,
    candidate: {
      candidate_id: row.candidate.candidateId,
      person_id: row.candidate.personId,
      full_name: row.candidate.fullName,
      email: row.candidate.email,
      phone: row.candidate.phone ?? null,
      resume_path: row.candidate.resumePath ?? null,
    },
  };
}

export async function listApplicationsJson(params: {
  organizationId: string;
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
  candidateId?: number | null;
  limit?: number | null;
}) {
  const rows = await applicationsRepo.selectApplicationsFiltered(params);
  return rows.map(applicationToJson);
}

type ApplicationJson = ReturnType<typeof applicationToJson>;

function enrichApplicationWithStoredRanking(
  base: ApplicationJson,
  rankingVersionId: number | null,
  scoreByCandidate: Map<
    number,
    { score: string; breakdown: Record<string, unknown> }
  >,
): ApplicationJson & {
  ranking: {
    ranking_version_id: number;
    final_score: number | null;
    breakdown: Record<string, unknown>;
  } | null;
} {
  if (rankingVersionId == null) {
    return { ...base, ranking: null };
  }
  const s = scoreByCandidate.get(base.candidate_id);
  if (!s) {
    return { ...base, ranking: null };
  }
  const breakdownObj = (s.breakdown as Record<string, unknown> | null | undefined) ?? undefined;
  const hasBreakdownFinal =
    breakdownObj != null && Object.prototype.hasOwnProperty.call(breakdownObj, "final");
  const breakdownFinal = hasBreakdownFinal ? breakdownObj.final : undefined;
  let final: number | null = null;
  if (typeof breakdownFinal === "number" && Number.isFinite(breakdownFinal)) {
    final = breakdownFinal;
  } else if (hasBreakdownFinal && breakdownFinal == null) {
    // Explicitly null final means pending/unknown; keep candidate unranked.
    final = null;
  } else {
    const parsed = Number.parseFloat(s.score);
    final = Number.isFinite(parsed) ? parsed : null;
  }
  return {
    ...base,
    ranking: {
      ranking_version_id: rankingVersionId,
      final_score: final,
      breakdown: s.breakdown,
    },
  };
}

/** Doc-style response: quality buckets (plus UNRANKED when no `ats_bucket`). Includes latest `candidate_job_scores` per candidate. */
export async function listApplicationsGroupedByAtsBucketJson(params: {
  organizationId: string;
  requisitionItemId: number;
  limitPerBucket?: number;
}) {
  if (params.requisitionItemId == null) {
    throw new HttpError(422, "requisition_item_id is required");
  }
  const limit = Math.min(Math.max(params.limitPerBucket ?? 100, 1), 500);
  const rows = await applicationsRepo.selectApplicationsFiltered({
    organizationId: params.organizationId,
    requisitionItemId: params.requisitionItemId,
  });

  const rankingVersionId =
    await rankingMetadataRepo.selectLatestRankingVersionIdForRequisitionItem(
      params.requisitionItemId,
    );
  const scoreRows =
    rankingVersionId != null
      ? await rankingMetadataRepo.selectCandidateJobScoresForRankingVersion(
          rankingVersionId,
        )
      : [];
  const scoreByCandidate = new Map(
    scoreRows.map((r) => [
      r.candidateId,
      { score: r.score, breakdown: r.breakdown },
    ]),
  );
  const scoredFinals = Array.from(scoreByCandidate.values())
    .map((s) => {
      const b = (s.breakdown as { final?: unknown } | null | undefined)?.final;
      if (typeof b === "number" && Number.isFinite(b)) return b;
      const parsed = Number.parseFloat(s.score);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    })
    .filter((n) => Number.isFinite(n));
  const topFinalScore = scoredFinals.length > 0 ? Math.max(...scoredFinals) : Number.NaN;
  const bucketMode = resolveAtsBucketMode();

  const bucketOrder = [...ATS_BUCKET_KEYS];
  const buckets: Record<
    string,
    Array<
      ApplicationJson & {
        ranking: {
          ranking_version_id: number;
          final_score: number | null;
          breakdown: Record<string, unknown>;
        } | null;
      }
    >
  > = {};
  for (const b of bucketOrder) {
    buckets[b] = [];
  }
  buckets.UNRANKED = [];
  const truncated: Record<string, boolean> = {};

  for (const row of rows) {
    const base = applicationToJson(row);
    const enriched = enrichApplicationWithStoredRanking(
      base,
      rankingVersionId,
      scoreByCandidate,
    );

    const persisted = row.application.atsBucket;
    const scoreBucket =
      enriched.ranking?.final_score != null &&
      Number.isFinite(enriched.ranking.final_score)
        ? bucketMode === "dynamic_relative" && Number.isFinite(topFinalScore) && topFinalScore > 0
          ? getAtsBucketFromRelativeScore(enriched.ranking.final_score / topFinalScore)
          : getAtsBucketFromFinalScore(enriched.ranking.final_score)
        : null;
    // Prefer live score bucket so Kanban reflects latest ranking immediately.
    // Fall back to persisted ats_bucket, then UNRANKED when no score exists.
    const key =
      scoreBucket ??
      (persisted != null && (bucketOrder as readonly string[]).includes(persisted)
        ? persisted
        : "UNRANKED");

    const target = buckets[key]!;
    if (target.length >= limit) {
      truncated[key] = true;
      continue;
    }
    target.push(enriched);
  }

  return {
    requisition_item_id: params.requisitionItemId,
    BEST: buckets.BEST,
    VERY_GOOD: buckets.VERY_GOOD,
    GOOD: buckets.GOOD,
    AVERAGE: buckets.AVERAGE,
    NOT_SUITABLE: buckets.NOT_SUITABLE,
    UNRANKED: buckets.UNRANKED,
    meta: {
      limit_per_bucket: limit,
      truncated,
      total: rows.length,
      ranking_version_id: rankingVersionId,
    },
  };
}

/**
 * Idempotent application ensure for a candidate (Phase 1: one application per `candidate_id`).
 * Safe to call from `POST /api/applications` retries or backfill jobs — second call returns
 * `{ created: false, application }`. See Candidate_Pipeline.txt §18.
 */
export async function ensureApplicationFromCandidateJson(params: {
  candidateId: number;
  requisitionItemId: number;
  organizationId: string;
  userId: number;
}): Promise<{ created: boolean; application: Awaited<ReturnType<typeof getApplicationJson>> }> {
  const cand = await candidatesRepo.selectCandidateById(
    params.candidateId,
    params.organizationId,
  );
  if (!cand) {
    throw new HttpError(404, "Candidate not found");
  }
  if (cand.requisitionItemId !== params.requisitionItemId) {
    throw new HttpError(
      400,
      "Candidate does not belong to this requisition item",
    );
  }

  const existing = await applicationsRepo.selectApplicationByCandidateId(
    params.candidateId,
    params.organizationId,
  );
  if (existing) {
    const application = await getApplicationJson(
      existing.applicationId,
      params.organizationId,
    );
    return { created: false, application };
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    await ensureApplicationForCandidateTx({
      tx,
      organizationId: params.organizationId,
      candidateId: params.candidateId,
      requisitionItemId: cand.requisitionItemId,
      requisitionId: cand.requisitionId,
      candidateStage: cand.currentStage,
      source: "api_ensure",
      performedBy: params.userId,
      reason: "POST /api/applications",
    });
  });

  const after = await applicationsRepo.selectApplicationByCandidateId(
    params.candidateId,
    params.organizationId,
  );
  if (!after) {
    throw new HttpError(500, "Application could not be created");
  }
  const application = await getApplicationJson(after.applicationId, params.organizationId);
  return { created: true, application };
}

export async function shortlistApplicationJson(
  applicationId: number,
  user: ApiUser,
  roles: string[],
) {
  return patchApplicationStageJson(
    applicationId,
    "Shortlisted",
    undefined,
    user,
    roles,
  );
}

export async function getApplicationJson(
  applicationId: number,
  organizationId: string,
) {
  const row = await applicationsRepo.selectApplicationById(
    applicationId,
    organizationId,
  );
  if (!row) {
    throw new HttpError(404, "Application not found");
  }
  const history = await applicationsRepo.selectApplicationHistory(applicationId);
  return {
    ...applicationToJson(row),
    stage_history: history.map(applicationHistoryToJson),
  };
}

export async function patchApplicationStageJson(
  applicationId: number,
  newStage: string,
  reason: string | undefined,
  user: ApiUser,
  roles: string[],
) {
  const app = await applicationsRepo.selectApplicationById(
    applicationId,
    user.organizationId,
  );
  if (!app) {
    throw new HttpError(404, "Application not found");
  }

  await patchCandidateStageJson(app.application.candidateId, newStage, user, roles, reason);

  const after = await applicationsRepo.selectApplicationByCandidateId(
    app.application.candidateId,
    user.organizationId,
  );
  if (!after) {
    throw new HttpError(500, "Application not found after stage update");
  }
  return getApplicationJson(after.applicationId, user.organizationId);
}

export async function getApplicationsPipelineJson(params: {
  organizationId: string;
  requisitionItemId?: number | null;
  requisitionId?: number | null;
  compact?: boolean;
}) {
  if (params.requisitionItemId == null && params.requisitionId == null) {
    throw new HttpError(422, "Provide requisition_item_id or requisition_id");
  }

  const rows = await applicationsRepo.selectApplicationsFiltered({
    organizationId: params.organizationId,
    requisitionItemId: params.requisitionItemId ?? null,
    requisitionId: params.requisitionId ?? null,
  });

  const seeded = new Map<string, ReturnType<typeof applicationToJson>[]>();
  for (const stage of APPLICATION_STAGE_ORDER) {
    seeded.set(stage, []);
  }

  for (const row of rows) {
    const stage = row.application.currentStage || "Sourced";
    const arr = seeded.get(stage) ?? [];
    arr.push(applicationToJson(row));
    seeded.set(stage, arr);
  }

  const stages = Array.from(seeded.entries()).map(([stage, applications]) =>
    params.compact
      ? {
          stage,
          count: applications.length,
        }
      : {
          stage,
          count: applications.length,
          applications,
        },
  );

  const unknown = rows
    .filter((r) => !APPLICATION_STAGE_SET.has(r.application.currentStage))
    .map(applicationToJson);
  if (unknown.length > 0) {
    if (params.compact) {
      stages.push({
        stage: "Unknown",
        count: unknown.length,
      });
    } else {
      stages.push({
        stage: "Unknown",
        count: unknown.length,
        applications: unknown,
      });
    }
  }

  return {
    requisition_item_id: params.requisitionItemId ?? null,
    requisition_id: params.requisitionId ?? null,
    total: rows.length,
    stages,
  };
}
