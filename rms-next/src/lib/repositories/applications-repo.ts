import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { applicationStageHistory, applications, candidates } from "@/lib/db/schema";
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

export async function selectApplicationsFiltered(params: {
  organizationId: string;
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
  candidateId?: number | null;
  limit?: number | null;
}): Promise<ApplicationWithCandidateRow[]> {
  const db = getDb();
  const conds = [eq(applications.organizationId, params.organizationId)];
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
