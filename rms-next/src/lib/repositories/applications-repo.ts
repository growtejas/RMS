import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb, getReadDb } from "@/lib/db";
import {
  applicationStageHistory,
  applications,
  candidates,
  interviews,
  requisitionItems,
  users,
} from "@/lib/db/schema";
import type { AtsBucket } from "@/lib/services/ats-buckets";

export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationStageHistoryRow = typeof applicationStageHistory.$inferSelect;
export type ApplicationWithCandidateRow = {
  application: ApplicationRow;
  candidate: {
    candidateId: number;
    personId: number;
    fullName: string;
    email: string;
    phone: string | null;
    resumePath: string | null;
  };
};

function buildApplicationFilterConds(params: {
  organizationId: string;
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
  candidateId?: number | null;
}): SQL[] {
  const conds: SQL[] = [eq(applications.organizationId, params.organizationId)];
  if (params.requisitionId != null) {
    conds.push(eq(applications.requisitionId, params.requisitionId));
  }
  if (params.requisitionItemId != null) {
    conds.push(eq(applications.requisitionItemId, params.requisitionItemId));
  }
  if (params.currentStage != null && params.currentStage !== "") {
    conds.push(eq(applications.currentStage, params.currentStage));
  }
  if (params.candidateId != null) {
    conds.push(eq(applications.candidateId, params.candidateId));
  }
  return conds;
}

export async function selectApplicationsFiltered(params: {
  organizationId: string;
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
  candidateId?: number | null;
  limit?: number | null;
}): Promise<ApplicationWithCandidateRow[]> {
  const db = getReadDb();
  const conds = buildApplicationFilterConds(params);

  const lim =
    params.limit != null && params.limit > 0
      ? Math.min(params.limit, 2000)
      : null;

  const query = db
    .select({
      application: applications,
      candidate: {
        candidateId: candidates.candidateId,
        personId: candidates.personId,
        fullName: candidates.fullName,
        email: candidates.email,
        phone: candidates.phone,
        resumePath: candidates.resumePath,
      },
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.candidateId));

  const filtered =
    conds.length === 0 ? query : query.where(and(...conds));
  const ordered = filtered.orderBy(desc(applications.createdAt));
  return lim != null ? ordered.limit(lim) : ordered;
}

/** Canonical paginated reader for applications. Returns rows + offset; total via `countApplicationsFiltered`. */
export async function selectApplicationsFilteredPaged(params: {
  organizationId: string;
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
  candidateId?: number | null;
  limit: number;
  offset: number;
}): Promise<ApplicationWithCandidateRow[]> {
  const db = getReadDb();
  const conds = buildApplicationFilterConds(params);
  return db
    .select({
      application: applications,
      candidate: {
        candidateId: candidates.candidateId,
        personId: candidates.personId,
        fullName: candidates.fullName,
        email: candidates.email,
        phone: candidates.phone,
        resumePath: candidates.resumePath,
      },
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.candidateId))
    .where(and(...conds))
    .orderBy(desc(applications.createdAt))
    .limit(params.limit)
    .offset(params.offset);
}

export async function countApplicationsFiltered(params: {
  organizationId: string;
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
  candidateId?: number | null;
}): Promise<number> {
  const db = getReadDb();
  const conds = buildApplicationFilterConds(params);
  const [row] = await db
    .select({ n: count() })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.candidateId))
    .where(and(...conds));
  return Number(row?.n ?? 0);
}

export async function selectApplicationById(
  applicationId: number,
  organizationId: string,
): Promise<ApplicationWithCandidateRow | null> {
  const db = getDb();
  const [row] = await db
    .select({
      application: applications,
      candidate: {
        candidateId: candidates.candidateId,
        personId: candidates.personId,
        fullName: candidates.fullName,
        email: candidates.email,
        phone: candidates.phone,
        resumePath: candidates.resumePath,
      },
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.candidateId))
    .where(
      and(
        eq(applications.applicationId, applicationId),
        eq(applications.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function selectApplicationByCandidateId(
  candidateId: number,
  organizationId: string,
): Promise<ApplicationRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.candidateId, candidateId),
        eq(applications.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function selectApplicationHistory(
  applicationId: number,
): Promise<ApplicationStageHistoryRow[]> {
  const db = getDb();
  return db
    .select()
    .from(applicationStageHistory)
    .where(eq(applicationStageHistory.applicationId, applicationId))
    .orderBy(asc(applicationStageHistory.changedAt), asc(applicationStageHistory.historyId));
}

/** After ranking recompute: reset buckets for the line, then set from final scores. */
export async function replaceApplicationAtsBucketsForRequisitionItem(params: {
  requisitionItemId: number;
  organizationId: string;
  candidateBuckets: Map<number, AtsBucket>;
}): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ atsBucket: null, updatedAt: new Date() })
      .where(
        and(
          eq(applications.requisitionItemId, params.requisitionItemId),
          eq(applications.organizationId, params.organizationId),
        ),
      );
    for (const [candidateId, bucket] of Array.from(params.candidateBuckets.entries())) {
      await tx
        .update(applications)
        .set({ atsBucket: bucket, updatedAt: new Date() })
        .where(
          and(
            eq(applications.candidateId, candidateId),
            eq(applications.requisitionItemId, params.requisitionItemId),
            eq(applications.organizationId, params.organizationId),
          ),
        );
    }
  });
}

export async function updateApplicationAtsBucketForCandidate(params: {
  organizationId: string;
  requisitionItemId: number;
  candidateId: number;
  atsBucket: AtsBucket | null;
}): Promise<void> {
  const db = getDb();
  await db
    .update(applications)
    .set({ atsBucket: params.atsBucket, updatedAt: new Date() })
    .where(
      and(
        eq(applications.organizationId, params.organizationId),
        eq(applications.requisitionItemId, params.requisitionItemId),
        eq(applications.candidateId, params.candidateId),
      ),
    );
}

// ---------------------------------------------------------------------------
// TA requisition — candidates workspace (paginated roster)
// ---------------------------------------------------------------------------

export type ApplicationWorkspaceRow = {
  application: ApplicationRow;
  candidate: {
    candidateId: number;
    personId: number;
    fullName: string;
    email: string;
    phone: string | null;
    resumePath: string | null;
    totalExperienceYears: string | number | null;
  };
  recruiter: { userId: number; username: string } | null;
  rolePosition: string | null;
};

function escapeIlikePattern(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Extra WHERE for `interview_status` query param (correlated to `applications`). */
export function workspaceInterviewStatusSql(status: string | null | undefined): SQL | undefined {
  const s = status?.trim().toLowerCase();
  if (!s || s === "any") {
    return undefined;
  }

  const iv0 = alias(interviews, "iv0");
  if (s === "none") {
    return sql`NOT EXISTS (
      SELECT 1 FROM ${iv0}
      WHERE ${eq(iv0.applicationId, applications.applicationId)}
      AND upper(trim(coalesce(${iv0.status}, ''))) <> 'CANCELLED'
    )`;
  }

  const latestActive = sql`(
    SELECT DISTINCT ON (i.application_id) i.application_id, i.status, i.result
    FROM interviews i
    WHERE upper(trim(coalesce(i.status, ''))) <> 'CANCELLED'
    ORDER BY i.application_id, i.round_number DESC, i.scheduled_at DESC NULLS LAST
  )`;

  const ivs = alias(interviews, "ivs");
  if (s === "scheduled") {
    return sql`EXISTS (
      SELECT 1 FROM ${ivs}
      WHERE ${eq(ivs.applicationId, applications.applicationId)}
      AND upper(trim(coalesce(${ivs.status}, ''))) IN ('SCHEDULED', 'RESCHEDULED')
    )`;
  }

  if (s === "passed_latest") {
    return sql`EXISTS (
      SELECT 1 FROM ${latestActive} latest
      WHERE latest.application_id = ${applications.applicationId}
      AND upper(trim(latest.status)) = 'COMPLETED'
      AND upper(trim(coalesce(latest.result, ''))) = 'PASS'
    )`;
  }

  if (s === "failed") {
    return sql`EXISTS (
      SELECT 1 FROM ${latestActive} latest
      WHERE latest.application_id = ${applications.applicationId}
      AND upper(trim(latest.status)) = 'COMPLETED'
      AND upper(trim(coalesce(latest.result, ''))) = 'FAIL'
    )`;
  }

  if (s === "rejected") {
    return or(
      eq(applications.currentStage, "Rejected"),
      sql`EXISTS (
        SELECT 1 FROM ${latestActive} latest
        WHERE latest.application_id = ${applications.applicationId}
        AND upper(trim(latest.status)) = 'COMPLETED'
        AND upper(trim(coalesce(latest.result, ''))) = 'FAIL'
      )`,
    );
  }

  if (s === "in_progress") {
    return sql`EXISTS (
      SELECT 1 FROM ${latestActive} latest
      WHERE latest.application_id = ${applications.applicationId}
      AND (
        upper(trim(latest.status)) IN ('SCHEDULED', 'RESCHEDULED', 'NO_SHOW')
        OR (
          upper(trim(latest.status)) = 'COMPLETED'
          AND (
            latest.result IS NULL
            OR trim(coalesce(latest.result, '')) = ''
            OR upper(trim(latest.result)) = 'HOLD'
          )
        )
      )
    )`;
  }

  return undefined;
}

function workspaceBaseConds(params: {
  organizationId: string;
  requisitionId: number;
  requisitionItemId?: number | null;
  q?: string | null;
  currentStage?: string | null;
  source?: string | null;
  createdBy?: number | null;
  appliedFrom?: Date | null;
  appliedToExclusive?: Date | null;
  expMin?: number | null;
  expMax?: number | null;
  includeUnknownExp?: boolean;
  interviewStatus?: string | null;
}): SQL[] {
  const conds: SQL[] = [
    eq(applications.organizationId, params.organizationId),
    eq(applications.requisitionId, params.requisitionId),
  ];
  if (params.requisitionItemId != null) {
    conds.push(eq(applications.requisitionItemId, params.requisitionItemId));
  }
  if (params.currentStage != null && params.currentStage !== "") {
    conds.push(eq(applications.currentStage, params.currentStage));
  }
  if (params.source != null && params.source !== "") {
    conds.push(eq(applications.source, params.source));
  }
  if (params.createdBy != null) {
    conds.push(eq(applications.createdBy, params.createdBy));
  }
  if (params.appliedFrom != null) {
    conds.push(gte(applications.createdAt, params.appliedFrom));
  }
  if (params.appliedToExclusive != null) {
    conds.push(lte(applications.createdAt, params.appliedToExclusive));
  }

  const q = params.q?.trim();
  if (q && q.length > 0) {
    const pat = `%${escapeIlikePattern(q)}%`;
    conds.push(
      or(
        ilike(candidates.fullName, pat),
        ilike(candidates.email, pat),
        ilike(candidates.phone, pat),
      )!,
    );
  }

  const incUn = params.includeUnknownExp === true;
  if (params.expMin != null) {
    if (incUn) {
      conds.push(
        sql`(${candidates.totalExperienceYears} IS NULL OR ${candidates.totalExperienceYears}::numeric >= ${params.expMin})`,
      );
    } else {
      conds.push(
        sql`${candidates.totalExperienceYears} IS NOT NULL AND ${candidates.totalExperienceYears}::numeric >= ${params.expMin}`,
      );
    }
  }
  if (params.expMax != null) {
    if (incUn) {
      conds.push(
        sql`(${candidates.totalExperienceYears} IS NULL OR ${candidates.totalExperienceYears}::numeric <= ${params.expMax})`,
      );
    } else {
      conds.push(
        sql`${candidates.totalExperienceYears} IS NOT NULL AND ${candidates.totalExperienceYears}::numeric <= ${params.expMax}`,
      );
    }
  }

  const ivSql = workspaceInterviewStatusSql(params.interviewStatus);
  if (ivSql) {
    conds.push(ivSql);
  }

  return conds;
}

export async function countApplicationsWorkspace(params: {
  organizationId: string;
  requisitionId: number;
  requisitionItemId?: number | null;
  q?: string | null;
  currentStage?: string | null;
  source?: string | null;
  createdBy?: number | null;
  appliedFrom?: Date | null;
  appliedToExclusive?: Date | null;
  expMin?: number | null;
  expMax?: number | null;
  includeUnknownExp?: boolean;
  interviewStatus?: string | null;
}): Promise<number> {
  const db = getReadDb();
  const conds = workspaceBaseConds(params);
  const [row] = await db
    .select({ c: count() })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.candidateId))
    .where(and(...conds));
  return Number(row?.c ?? 0);
}

export async function selectApplicationsWorkspacePage(params: {
  organizationId: string;
  requisitionId: number;
  requisitionItemId?: number | null;
  q?: string | null;
  currentStage?: string | null;
  source?: string | null;
  createdBy?: number | null;
  appliedFrom?: Date | null;
  appliedToExclusive?: Date | null;
  expMin?: number | null;
  expMax?: number | null;
  includeUnknownExp?: boolean;
  interviewStatus?: string | null;
  offset: number;
  limit: number;
}): Promise<ApplicationWorkspaceRow[]> {
  const db = getReadDb();
  const conds = workspaceBaseConds(params);
  const lim = Math.min(Math.max(params.limit, 1), 50);
  const off = Math.max(params.offset, 0);

  return db
    .select({
      application: applications,
      candidate: {
        candidateId: candidates.candidateId,
        personId: candidates.personId,
        fullName: candidates.fullName,
        email: candidates.email,
        phone: candidates.phone,
        resumePath: candidates.resumePath,
        totalExperienceYears: candidates.totalExperienceYears,
      },
      recruiter: {
        userId: users.userId,
        username: users.username,
      },
      rolePosition: requisitionItems.rolePosition,
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.candidateId))
    .innerJoin(
      requisitionItems,
      eq(applications.requisitionItemId, requisitionItems.itemId),
    )
    .leftJoin(users, eq(applications.createdBy, users.userId))
    .where(and(...conds))
    .orderBy(desc(applications.createdAt))
    .limit(lim)
    .offset(off);
}

export type WorkspaceFacetsRow = {
  stages: string[];
  sources: string[];
  recruiters: Array<{ id: number; name: string }>;
};

export async function selectRequisitionWorkspaceFacets(params: {
  organizationId: string;
  requisitionId: number;
}): Promise<WorkspaceFacetsRow> {
  const db = getReadDb();
  const base = and(
    eq(applications.organizationId, params.organizationId),
    eq(applications.requisitionId, params.requisitionId),
  );

  const stageRows = await db
    .select({ s: applications.currentStage })
    .from(applications)
    .where(base)
    .groupBy(applications.currentStage)
    .orderBy(asc(applications.currentStage));

  const sourceRows = await db
    .select({ s: applications.source })
    .from(applications)
    .where(base)
    .groupBy(applications.source)
    .orderBy(asc(applications.source));

  const recRows = await db
    .select({
      id: applications.createdBy,
      name: users.username,
    })
    .from(applications)
    .leftJoin(users, eq(applications.createdBy, users.userId))
    .where(and(base, isNotNull(applications.createdBy)))
    .groupBy(applications.createdBy, users.username)
    .orderBy(asc(users.username));

  const recruiters = recRows
    .filter((r) => r.id != null && r.name != null)
    .map((r) => ({ id: r.id as number, name: r.name as string }));

  return {
    stages: stageRows.map((r) => r.s).filter(Boolean),
    sources: sourceRows.map((r) => r.s).filter(Boolean),
    recruiters,
  };
}
