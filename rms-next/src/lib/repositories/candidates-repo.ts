import { and, asc, count, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { auditLog, candidates, interviews, requisitionItems, requisitions } from "@/lib/db/schema";

export type CandidateRow = typeof candidates.$inferSelect;
export type InterviewRow = typeof interviews.$inferSelect;

export async function selectCandidateById(
  candidateId: number,
): Promise<CandidateRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.candidateId, candidateId))
    .limit(1);
  return row ?? null;
}

export async function selectCandidatesFiltered(params: {
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
}): Promise<CandidateRow[]> {
  const db = getDb();
  const conds = [];
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

/** List interviews; optional filter by candidate (FastAPI `GET /interviews/`). */
export async function selectInterviewsList(
  candidateId?: number | null,
): Promise<InterviewRow[]> {
  const db = getDb();
  if (candidateId != null) {
    return db
      .select()
      .from(interviews)
      .where(eq(interviews.candidateId, candidateId))
      .orderBy(asc(interviews.roundNumber));
  }
  return db.select().from(interviews).orderBy(asc(interviews.roundNumber));
}

export async function selectInterviewById(
  interviewId: number,
): Promise<InterviewRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(interviews)
    .where(eq(interviews.id, interviewId))
    .limit(1);
  return row ?? null;
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
): Promise<{ reqId: number; raisedBy: number } | null> {
  const db = getDb();
  const [row] = await db
    .select({
      reqId: requisitionItems.reqId,
      raisedBy: requisitions.raisedBy,
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
  patch: Partial<{
    fullName: string;
    email: string;
    phone: string | null;
    currentCompany: string | null;
    resumePath: string | null;
    currentStage: string;
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
  const [row] = await db
    .update(candidates)
    .set(set)
    .where(eq(candidates.candidateId, candidateId))
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

export async function deleteCandidateById(candidateId: number): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(candidates)
    .where(eq(candidates.candidateId, candidateId))
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
  const [row] = await db
    .insert(interviews)
    .values({
      candidateId: values.candidateId,
      roundNumber: values.roundNumber,
      interviewerName: values.interviewerName,
      scheduledAt: values.scheduledAt,
      status: "Scheduled",
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
