import { and, asc, count, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  applications,
  auditLog,
  candidates,
  interviews,
  requisitionItems,
  requisitions,
} from "@/lib/db/schema";
import * as ivRepo from "@/lib/repositories/interviews-repo";
import type { AppDb } from "@/lib/workflow/workflow-db";

export type CandidateRow = typeof candidates.$inferSelect;
export type InterviewRow = typeof interviews.$inferSelect;

export async function selectCandidateById(
  candidateId: number,
  organizationId: string,
): Promise<CandidateRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.candidateId, candidateId),
        eq(candidates.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Same org + job line: one candidate row per email (case-insensitive). */
export async function selectCandidateIdByOrgItemEmailLower(params: {
  organizationId: string;
  requisitionItemId: number;
  emailLower: string;
}): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({ candidateId: candidates.candidateId })
    .from(candidates)
    .where(
      and(
        eq(candidates.organizationId, params.organizationId),
        eq(candidates.requisitionItemId, params.requisitionItemId),
        sql`lower(${candidates.email}) = ${params.emailLower}`,
      ),
    )
    .limit(1);
  return row?.candidateId ?? null;
}

export async function selectCandidateIdByOrgItemPersonTx(
  tx: AppDb,
  params: {
    organizationId: string;
    requisitionItemId: number;
    personId: number;
  },
): Promise<number | null> {
  const [row] = await tx
    .select({ candidateId: candidates.candidateId })
    .from(candidates)
    .where(
      and(
        eq(candidates.organizationId, params.organizationId),
        eq(candidates.requisitionItemId, params.requisitionItemId),
        eq(candidates.personId, params.personId),
      ),
    )
    .limit(1);
  return row?.candidateId ?? null;
}

export async function selectCandidatesFiltered(params: {
  organizationId: string;
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
}): Promise<CandidateRow[]> {
  const db = getDb();
  const conds = [eq(candidates.organizationId, params.organizationId)];
  if (params.requisitionId != null) {
    conds.push(eq(candidates.requisitionId, params.requisitionId));
  }
  if (params.requisitionItemId != null) {
    conds.push(eq(candidates.requisitionItemId, params.requisitionItemId));
  }
  if (params.currentStage != null && params.currentStage !== "") {
    conds.push(eq(candidates.currentStage, params.currentStage));
  }
  const base = db.select().from(candidates);
  if (conds.length === 0) {
    return base.orderBy(desc(candidates.createdAt));
  }
  return base.where(and(...conds)).orderBy(desc(candidates.createdAt));
}

export async function selectInterviewsForCandidates(
  candidateIds: number[],
): Promise<InterviewRow[]> {
  if (candidateIds.length === 0) {
    return [];
  }
  const db = getDb();
  return db
    .select()
    .from(interviews)
    .where(inArray(interviews.candidateId, candidateIds))
    .orderBy(asc(interviews.candidateId), asc(interviews.roundNumber));
}

export async function selectInterviewsForCandidate(
  candidateId: number,
): Promise<InterviewRow[]> {
  const db = getDb();
  return db
    .select()
    .from(interviews)
    .where(eq(interviews.candidateId, candidateId))
    .orderBy(asc(interviews.roundNumber));
}

export type InterviewWithCandidateRow = {
  interview: InterviewRow;
  candidateFullName: string;
  candidateEmail: string | null;
};

/** List interviews with candidate identity; optional filters (AND). */
export async function selectInterviewsList(
  organizationId: string,
  filters?: { candidateId?: number | null; requisitionId?: number | null },
): Promise<InterviewWithCandidateRow[]> {
  const db = getDb();
  const conds = [eq(candidates.organizationId, organizationId)];
  if (filters?.candidateId != null) {
    conds.push(eq(interviews.candidateId, filters.candidateId));
  }
  if (filters?.requisitionId != null) {
    let rows = await ivRepo.listInterviewsForRequisition({
      reqId: filters.requisitionId,
      organizationId,
    });
    if (filters.candidateId != null) {
      rows = rows.filter((r) => r.interview.candidateId === filters.candidateId);
    }
    return rows;
  }
  return db
    .select({
      interview: interviews,
      candidateFullName: candidates.fullName,
      candidateEmail: candidates.email,
    })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.candidateId))
    .where(and(...conds))
    .orderBy(desc(interviews.scheduledAt));
}

export async function selectInterviewById(
  interviewId: number,
  organizationId: string,
): Promise<InterviewRow | null> {
  const db = getDb();
  const [row] = await db
    .select({ iv: interviews })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.candidateId))
    .where(
      and(
        eq(interviews.id, interviewId),
        eq(candidates.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row?.iv ?? null;
}

export async function countInterviewsForCandidate(
  candidateId: number,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(interviews)
    .where(eq(interviews.candidateId, candidateId));
  return Number(row?.c ?? 0);
}

/** Requisition header `raised_by` is used as `added_by` for system / inbound creates. */
export async function selectRequisitionItemMetaByItemId(
  itemId: number,
): Promise<{ reqId: number; raisedBy: number; organizationId: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({
      reqId: requisitionItems.reqId,
      raisedBy: requisitions.raisedBy,
      organizationId: requisitions.organizationId,
    })
    .from(requisitionItems)
    .innerJoin(requisitions, eq(requisitionItems.reqId, requisitions.reqId))
    .where(eq(requisitionItems.itemId, itemId))
    .limit(1);
  return row ?? null;
}

/** Phase 3 soft dedupe: same job line, digit-stripped phone match, optional different-email filter. */
export async function selectCandidateIdsSameItemPhoneDigits(params: {
  requisitionItemId: number;
  phoneDigits: string;
  excludeEmailLower: string | null;
}): Promise<number[]> {
  const db = getDb();
  const digitExpr = sql`regexp_replace(coalesce(${candidates.phone}, ''), '[^0-9]+', '', 'g')`;
  const conds = [
    eq(candidates.requisitionItemId, params.requisitionItemId),
    sql`${digitExpr} = ${params.phoneDigits}`,
  ];
  if (params.excludeEmailLower) {
    conds.push(sql`lower(${candidates.email}) <> ${params.excludeEmailLower}`);
  }
  const rows = await db
    .select({ candidateId: candidates.candidateId })
    .from(candidates)
    .where(and(...conds));
  return rows.map((r) => r.candidateId);
}

export async function selectCandidateIdsSameItemNameAndCompany(params: {
  requisitionItemId: number;
  normalizedFullNameKey: string;
  normalizedCompanyKey: string;
  excludeEmailLower: string | null;
}): Promise<number[]> {
  const db = getDb();
  const nameExpr = sql`lower(regexp_replace(trim(${candidates.fullName}), '[[:space:]]+', ' ', 'g'))`;
  const companyExpr = sql`lower(trim(coalesce(${candidates.currentCompany}, '')))`;
  const conds = [
    eq(candidates.requisitionItemId, params.requisitionItemId),
    sql`${nameExpr} = ${params.normalizedFullNameKey}`,
    sql`${companyExpr} = ${params.normalizedCompanyKey}`,
  ];
  if (params.excludeEmailLower) {
    conds.push(sql`lower(${candidates.email}) <> ${params.excludeEmailLower}`);
  }
  const rows = await db
    .select({ candidateId: candidates.candidateId })
    .from(candidates)
    .where(and(...conds));
  return rows.map((r) => r.candidateId);
}

export async function selectCandidateIdsSameItemNameNoCompany(params: {
  requisitionItemId: number;
  normalizedFullNameKey: string;
  excludeEmailLower: string | null;
}): Promise<number[]> {
  const db = getDb();
  const nameExpr = sql`lower(regexp_replace(trim(${candidates.fullName}), '[[:space:]]+', ' ', 'g'))`;
  const conds = [
    eq(candidates.requisitionItemId, params.requisitionItemId),
    sql`${nameExpr} = ${params.normalizedFullNameKey}`,
    sql`trim(coalesce(${candidates.currentCompany}, '')) = ''`,
  ];
  if (params.excludeEmailLower) {
    conds.push(sql`lower(${candidates.email}) <> ${params.excludeEmailLower}`);
  }
  const rows = await db
    .select({ candidateId: candidates.candidateId })
    .from(candidates)
    .where(and(...conds));
  return rows.map((r) => r.candidateId);
}

export async function insertCandidateRow(values: {
  organizationId: string;
  personId: number;
  requisitionItemId: number;
  requisitionId: number;
  fullName: string;
  email: string;
  phone: string | null;
  currentCompany?: string | null;
  resumePath: string | null;
  addedBy: number;
}): Promise<CandidateRow> {
  const db = getDb();
  const [row] = await db
    .insert(candidates)
    .values({
      organizationId: values.organizationId,
      personId: values.personId,
      requisitionItemId: values.requisitionItemId,
      requisitionId: values.requisitionId,
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      currentCompany: values.currentCompany ?? null,
      resumePath: values.resumePath,
      currentStage: "Sourced",
      addedBy: values.addedBy,
    })
    .returning();
  if (!row) {
    throw new Error("insert candidate failed");
  }
  return row;
}

export async function insertCandidateAuditCreate(params: {
  candidateId: number;
  performedBy: number;
  message: string;
}) {
  const db = getDb();
  await db.insert(auditLog).values({
    entityName: "candidate",
    entityId: String(params.candidateId),
    action: "CREATE",
    performedBy: params.performedBy,
    newValue: params.message,
    performedAt: new Date(),
  });
}

export async function updateCandidateRow(
  candidateId: number,
  organizationId: string,
  patch: Partial<{
    fullName: string;
    email: string;
    phone: string | null;
    currentCompany: string | null;
    resumePath: string | null;
    currentStage: string;
    totalExperienceYears: string | null;
    noticePeriodDays: number | null;
    isReferral: boolean;
    candidateSkills: string[] | null;
    educationRaw: string | null;
  }>,
): Promise<CandidateRow | null> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.fullName !== undefined) {
    set.fullName = patch.fullName;
  }
  if (patch.email !== undefined) {
    set.email = patch.email;
  }
  if (patch.phone !== undefined) {
    set.phone = patch.phone;
  }
  if (patch.currentCompany !== undefined) {
    set.currentCompany = patch.currentCompany;
  }
  if (patch.resumePath !== undefined) {
    set.resumePath = patch.resumePath;
  }
  if (patch.currentStage !== undefined) {
    set.currentStage = patch.currentStage;
  }
  if (patch.totalExperienceYears !== undefined) {
    set.totalExperienceYears = patch.totalExperienceYears;
  }
  if (patch.noticePeriodDays !== undefined) {
    set.noticePeriodDays = patch.noticePeriodDays;
  }
  if (patch.isReferral !== undefined) {
    set.isReferral = patch.isReferral;
  }
  if (patch.candidateSkills !== undefined) {
    set.candidateSkills = patch.candidateSkills;
  }
  if (patch.educationRaw !== undefined) {
    set.educationRaw = patch.educationRaw;
  }
  const [row] = await db
    .update(candidates)
    .set(set)
    .where(
      and(
        eq(candidates.candidateId, candidateId),
        eq(candidates.organizationId, organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function insertAuditCandidateStage(params: {
  candidateId: number;
  performedBy: number;
  oldStage: string;
  newStage: string;
}) {
  const db = getDb();
  await db.insert(auditLog).values({
    entityName: "candidate",
    entityId: String(params.candidateId),
    action: "STAGE_CHANGE",
    performedBy: params.performedBy,
    oldValue: params.oldStage,
    newValue: params.newStage,
    performedAt: new Date(),
  });
}

export async function insertAuditCandidateRejectFilled(params: {
  candidateId: number;
  performedBy: number;
  prevStage: string;
}) {
  const db = getDb();
  await db.insert(auditLog).values({
    entityName: "candidate",
    entityId: String(params.candidateId),
    action: "STAGE_CHANGE",
    performedBy: params.performedBy,
    oldValue: params.prevStage,
    newValue: "Rejected (Position Filled)",
    performedAt: new Date(),
  });
}

export async function deleteCandidateById(
  candidateId: number,
  organizationId: string,
): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(candidates)
    .where(
      and(
        eq(candidates.candidateId, candidateId),
        eq(candidates.organizationId, organizationId),
      ),
    )
    .returning({ id: candidates.candidateId });
  return deleted.length > 0;
}

export async function insertAuditCandidateDelete(params: {
  candidateId: number;
  performedBy: number;
  label: string;
}) {
  const db = getDb();
  await db.insert(auditLog).values({
    entityName: "candidate",
    entityId: String(params.candidateId),
    action: "DELETE",
    performedBy: params.performedBy,
    oldValue: params.label,
    performedAt: new Date(),
  });
}

export async function selectOtherActiveCandidatesOnItem(params: {
  requisitionItemId: number;
  excludeCandidateId: number;
}) {
  const db = getDb();
  return db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.requisitionItemId, params.requisitionItemId),
        ne(candidates.candidateId, params.excludeCandidateId),
        notInArray(candidates.currentStage, ["Hired", "Rejected"]),
      ),
    );
}

export async function insertInterviewRow(values: {
  candidateId: number;
  roundNumber: number;
  interviewerName: string;
  scheduledAt: Date;
  conductedBy: number;
}): Promise<InterviewRow> {
  const db = getDb();
  const endTime = new Date(values.scheduledAt.getTime() + 60 * 60 * 1000);
  const [row] = await db
    .insert(interviews)
    .values({
      candidateId: values.candidateId,
      roundNumber: values.roundNumber,
      interviewerName: values.interviewerName,
      scheduledAt: values.scheduledAt,
      endTime,
      timezone: "UTC",
      status: "SCHEDULED",
      conductedBy: values.conductedBy,
    })
    .returning();
  if (!row) {
    throw new Error("insert interview failed");
  }
  return row;
}

export async function insertInterviewAuditCreate(params: {
  interviewId: number;
  performedBy: number;
  message: string;
}) {
  const db = getDb();
  await db.insert(auditLog).values({
    entityName: "interview",
    entityId: String(params.interviewId),
    action: "CREATE",
    performedBy: params.performedBy,
    newValue: params.message,
    performedAt: new Date(),
  });
}

export async function updateInterviewRow(
  interviewId: number,
  patch: Partial<{
    interviewerName: string;
    scheduledAt: Date;
    status: string;
    result: string | null;
    feedback: string | null;
  }>,
): Promise<InterviewRow | null> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.interviewerName !== undefined) {
    set.interviewerName = patch.interviewerName;
  }
  if (patch.scheduledAt !== undefined) {
    set.scheduledAt = patch.scheduledAt;
  }
  if (patch.status !== undefined) {
    set.status = patch.status;
  }
  if (patch.result !== undefined) {
    set.result = patch.result;
  }
  if (patch.feedback !== undefined) {
    set.feedback = patch.feedback;
  }
  const [row] = await db
    .update(interviews)
    .set(set)
    .where(eq(interviews.id, interviewId))
    .returning();
  return row ?? null;
}

export async function insertInterviewAuditUpdate(params: {
  interviewId: number;
  performedBy: number;
  oldValue: string;
  newValue: string;
}) {
  const db = getDb();
  await db.insert(auditLog).values({
    entityName: "interview",
    entityId: String(params.interviewId),
    action: "UPDATE",
    performedBy: params.performedBy,
    oldValue: params.oldValue,
    newValue: params.newValue,
    performedAt: new Date(),
  });
}

export async function deleteInterviewById(interviewId: number): Promise<boolean> {
  const db = getDb();
  const del = await db
    .delete(interviews)
    .where(eq(interviews.id, interviewId))
    .returning({ id: interviews.id });
  return del.length > 0;
}

export async function insertInterviewAuditDelete(params: {
  interviewId: number;
  performedBy: number;
  oldValue: string;
}) {
  const db = getDb();
  await db.insert(auditLog).values({
    entityName: "interview",
    entityId: String(params.interviewId),
    action: "DELETE",
    performedBy: params.performedBy,
    oldValue: params.oldValue,
    performedAt: new Date(),
  });
}

export async function batchUpdateResumeParseCache(
  rows: Array<{
    candidateId: number;
    resumeContentHash?: string | null;
    resumeParseCache?: Record<string, unknown> | null;
    resumeStructuredProfile?: Record<string, unknown> | null;
    resumeStructureStatus?: string | null;
  }>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const db = getDb();
  for (const r of rows) {
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (r.resumeContentHash !== undefined) {
      patch.resumeContentHash = r.resumeContentHash;
    }
    if (r.resumeParseCache !== undefined) {
      patch.resumeParseCache = r.resumeParseCache;
    }
    if (r.resumeStructuredProfile !== undefined) {
      patch.resumeStructuredProfile = r.resumeStructuredProfile;
    }
    if (r.resumeStructureStatus !== undefined) {
      patch.resumeStructureStatus = r.resumeStructureStatus;
    }
    await db.update(candidates).set(patch).where(eq(candidates.candidateId, r.candidateId));
  }
}
