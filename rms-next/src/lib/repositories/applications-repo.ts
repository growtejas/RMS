import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { applicationStageHistory, applications, candidates } from "@/lib/db/schema";

export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationStageHistoryRow = typeof applicationStageHistory.$inferSelect;
export type ApplicationWithCandidateRow = {
  application: ApplicationRow;
  candidate: {
    candidateId: number;
    fullName: string;
    email: string;
    phone: string | null;
  };
};

export async function selectApplicationsFiltered(params: {
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
  candidateId?: number | null;
}): Promise<ApplicationWithCandidateRow[]> {
  const db = getDb();
  const conds = [];
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

  const query = db
    .select({
      application: applications,
      candidate: {
        candidateId: candidates.candidateId,
        fullName: candidates.fullName,
        email: candidates.email,
        phone: candidates.phone,
      },
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.candidateId));

  if (conds.length === 0) {
    return query.orderBy(desc(applications.createdAt));
  }
  return query.where(and(...conds)).orderBy(desc(applications.createdAt));
}

export async function selectApplicationById(
  applicationId: number,
): Promise<ApplicationWithCandidateRow | null> {
  const db = getDb();
  const [row] = await db
    .select({
      application: applications,
      candidate: {
        candidateId: candidates.candidateId,
        fullName: candidates.fullName,
        email: candidates.email,
        phone: candidates.phone,
      },
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.candidateId))
    .where(eq(applications.applicationId, applicationId))
    .limit(1);
  return row ?? null;
}

export async function selectApplicationByCandidateId(
  candidateId: number,
): Promise<ApplicationRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(applications)
    .where(eq(applications.candidateId, candidateId))
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
