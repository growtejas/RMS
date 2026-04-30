import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
} from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  applications,
  candidates,
  employees,
  interviewPanelists,
  interviewReschedules,
  interviews,
  organizationMembers,
  requisitionItems,
  requisitions,
  users,
} from "@/lib/db/schema";

export type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export type InterviewRow = typeof interviews.$inferSelect;

const BLOCKING_STATUSES = ["SCHEDULED", "NO_SHOW"] as const;

export async function findApplicationForSchedule(params: {
  candidateId: number;
  requisitionItemId: number;
  organizationId: string;
}): Promise<{ applicationId: number } | null> {
  const db = getDb();
  const [row] = await db
    .select({ applicationId: applications.applicationId })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.candidateId))
    .where(
      and(
        eq(applications.candidateId, params.candidateId),
        eq(applications.requisitionItemId, params.requisitionItemId),
        eq(candidates.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findInvalidOrganizationUserIds(
  userIds: number[],
  organizationId: string,
): Promise<number[]> {
  if (userIds.length === 0) {
    return [];
  }
  const db = getDb();
  const rows = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        inArray(organizationMembers.userId, userIds),
      ),
    );
  const found = new Set(rows.map((r) => r.userId));
  return userIds.filter((id) => !found.has(id));
}

export async function resolveUserDisplayNames(
  userIds: number[],
): Promise<Map<number, string>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const db = getDb();
  const rows = await db
    .select({ userId: users.userId, username: users.username })
    .from(users)
    .where(inArray(users.userId, userIds));
  return new Map(rows.map((r) => [r.userId, r.username]));
}

export async function resolveInterviewerNotificationTargets(
  userIds: number[],
): Promise<Array<{ userId: number; username: string; email: string }>> {
  if (userIds.length === 0) {
    return [];
  }
  const db = getDb();
  const rows = await db
    .select({
      userId: users.userId,
      username: users.username,
      userEmail: users.email,
      email: employees.rbmEmail,
    })
    .from(users)
    .leftJoin(employees, eq(users.employeeId, employees.empId))
    .where(inArray(users.userId, userIds));
  return rows
    .filter(
      (
        r,
      ): r is {
        userId: number;
        username: string;
        email: string | null;
        userEmail: string | null;
      } =>
        (typeof r.email === "string" && r.email.trim().length > 0) ||
        (typeof r.userEmail === "string" && r.userEmail.trim().length > 0),
    )
    .map((r) => ({
      userId: r.userId,
      username: r.username,
      email: (r.email ?? r.userEmail ?? "").trim(),
    }));
}

export async function maxRoundNumberForCandidateItem(params: {
  candidateId: number;
  requisitionItemId: number;
}): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ m: sql<number>`max(${interviews.roundNumber})`.mapWith(Number) })
    .from(interviews)
    .where(
      and(
        eq(interviews.candidateId, params.candidateId),
        eq(interviews.requisitionItemId, params.requisitionItemId),
      ),
    );
  return row?.m ?? 0;
}

export async function findInterviewerConflicts(params: {
  interviewerUserIds: number[];
  windowStart: Date;
  windowEnd: Date;
  excludeInterviewId?: number;
}): Promise<Array<{ interviewId: number; userId: number }>> {
  if (params.interviewerUserIds.length === 0) {
    return [];
  }
  const db = getDb();
  const conds = [
    inArray(interviewPanelists.userId, params.interviewerUserIds),
    isNotNull(interviewPanelists.userId),
    inArray(interviews.status, [...BLOCKING_STATUSES]),
    lt(interviews.scheduledAt, params.windowEnd),
    gt(interviews.endTime, params.windowStart),
  ];
  if (params.excludeInterviewId != null) {
    conds.push(ne(interviews.id, params.excludeInterviewId));
  }
  const rows = await db
    .select({
      interviewId: interviews.id,
      userId: interviewPanelists.userId,
    })
    .from(interviews)
    .innerJoin(
      interviewPanelists,
      eq(interviewPanelists.interviewId, interviews.id),
    )
    .where(and(...conds));
  return rows.filter((r): r is { interviewId: number; userId: number } => r.userId != null);
}

export async function listInterviewsForRequisition(params: {
  reqId: number;
  organizationId: string;
}): Promise<
  Array<{
    interview: InterviewRow;
    candidateFullName: string;
    candidateEmail: string | null;
  }>
> {
  const db = getDb();
  const itemRows = await db
    .select({ itemId: requisitionItems.itemId })
    .from(requisitionItems)
    .where(eq(requisitionItems.reqId, params.reqId));
  const itemIds = itemRows.map((r) => r.itemId);

  const onItems =
    itemIds.length === 0
      ? []
      : await db
          .select({
            interview: interviews,
            candidateFullName: candidates.fullName,
            candidateEmail: candidates.email,
          })
          .from(interviews)
          .innerJoin(
            candidates,
            eq(interviews.candidateId, candidates.candidateId),
          )
          .where(
            and(
              eq(candidates.organizationId, params.organizationId),
              inArray(interviews.requisitionItemId, itemIds),
            ),
          );

  const legacy =
    itemIds.length === 0
      ? []
      : await db
          .select({
            interview: interviews,
            candidateFullName: candidates.fullName,
            candidateEmail: candidates.email,
          })
          .from(interviews)
          .innerJoin(
            candidates,
            eq(interviews.candidateId, candidates.candidateId),
          )
          .innerJoin(
            applications,
            eq(applications.candidateId, candidates.candidateId),
          )
          .where(
            and(
              eq(candidates.organizationId, params.organizationId),
              eq(applications.requisitionId, params.reqId),
              isNull(interviews.requisitionItemId),
            ),
          );

  const byId = new Map<
    number,
    {
      interview: InterviewRow;
      candidateFullName: string;
      candidateEmail: string | null;
    }
  >();
  for (const r of onItems) {
    byId.set(r.interview.id, r);
  }
  for (const r of legacy) {
    if (!byId.has(r.interview.id)) {
      byId.set(r.interview.id, r);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => b.interview.scheduledAt.getTime() - a.interview.scheduledAt.getTime(),
  );
}

export async function listPanelistsForInterviews(
  interviewIds: number[],
): Promise<(typeof interviewPanelists.$inferSelect)[]> {
  if (interviewIds.length === 0) {
    return [];
  }
  const db = getDb();
  return db
    .select()
    .from(interviewPanelists)
    .where(inArray(interviewPanelists.interviewId, interviewIds))
    .orderBy(asc(interviewPanelists.id));
}

export type InterviewWithCandidateAndRoleRow = {
  interview: InterviewRow;
  candidateFullName: string;
  candidateEmail: string | null;
  requisitionId: number | null;
  rolePosition: string | null;
};

/**
 * Manager-visible interviews:
 * - Interviews for requisitions raised by this manager (owner scope)
 * - OR interviews where this manager is a panelist (panelist scope)
 *
 * Returns a de-duped list by interview id.
 */
export async function listManagerInterviews(params: {
  organizationId: string;
  managerUserId: number;
}): Promise<InterviewWithCandidateAndRoleRow[]> {
  const db = getDb();

  const ownedRows = await db
    .select({
      interview: interviews,
      candidateFullName: candidates.fullName,
      candidateEmail: candidates.email,
      requisitionId: candidates.requisitionId,
      rolePosition: requisitionItems.rolePosition,
    })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.candidateId))
    .innerJoin(
      requisitionItems,
      eq(candidates.requisitionItemId, requisitionItems.itemId),
    )
    .innerJoin(requisitions, eq(candidates.requisitionId, requisitions.reqId))
    .where(
      and(
        eq(candidates.organizationId, params.organizationId),
        eq(requisitions.raisedBy, params.managerUserId),
      ),
    );

  const panelistRows = await db
    .select({
      interview: interviews,
      candidateFullName: candidates.fullName,
      candidateEmail: candidates.email,
      requisitionId: candidates.requisitionId,
      rolePosition: requisitionItems.rolePosition,
    })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.candidateId))
    .innerJoin(
      requisitionItems,
      eq(candidates.requisitionItemId, requisitionItems.itemId),
    )
    .innerJoin(
      interviewPanelists,
      eq(interviewPanelists.interviewId, interviews.id),
    )
    .where(
      and(
        eq(candidates.organizationId, params.organizationId),
        eq(interviewPanelists.userId, params.managerUserId),
        isNotNull(interviewPanelists.userId),
      ),
    );

  const byId = new Map<number, InterviewWithCandidateAndRoleRow>();
  for (const r of ownedRows) {
    byId.set(r.interview.id, r);
  }
  for (const r of panelistRows) {
    if (!byId.has(r.interview.id)) {
      byId.set(r.interview.id, r);
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => b.interview.scheduledAt.getTime() - a.interview.scheduledAt.getTime(),
  );
}

/** Panelist scope only (no hiring-manager ownership union). */
export async function listPanelistOnlyInterviews(params: {
  organizationId: string;
  userId: number;
}): Promise<InterviewWithCandidateAndRoleRow[]> {
  const db = getDb();
  const panelistRows = await db
    .select({
      interview: interviews,
      candidateFullName: candidates.fullName,
      candidateEmail: candidates.email,
      requisitionId: candidates.requisitionId,
      rolePosition: requisitionItems.rolePosition,
    })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.candidateId))
    .innerJoin(
      requisitionItems,
      eq(candidates.requisitionItemId, requisitionItems.itemId),
    )
    .innerJoin(
      interviewPanelists,
      eq(interviewPanelists.interviewId, interviews.id),
    )
    .where(
      and(
        eq(candidates.organizationId, params.organizationId),
        eq(interviewPanelists.userId, params.userId),
        isNotNull(interviewPanelists.userId),
      ),
    );

  const byId = new Map<number, InterviewWithCandidateAndRoleRow>();
  for (const r of panelistRows) {
    if (!byId.has(r.interview.id)) {
      byId.set(r.interview.id, r);
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => b.interview.scheduledAt.getTime() - a.interview.scheduledAt.getTime(),
  );
}

export async function userIsPanelistForInterview(params: {
  organizationId: string;
  userId: number;
  interviewId: number;
}): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: interviews.id })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.candidateId))
    .innerJoin(
      interviewPanelists,
      eq(interviewPanelists.interviewId, interviews.id),
    )
    .where(
      and(
        eq(candidates.organizationId, params.organizationId),
        eq(interviews.id, params.interviewId),
        eq(interviewPanelists.userId, params.userId),
        isNotNull(interviewPanelists.userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function findPanelistRowForUserOnInterview(params: {
  interviewId: number;
  userId: number;
}): Promise<(typeof interviewPanelists.$inferSelect) | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(interviewPanelists)
    .where(
      and(
        eq(interviewPanelists.interviewId, params.interviewId),
        eq(interviewPanelists.userId, params.userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function managerHasAccessToInterview(params: {
  organizationId: string;
  managerUserId: number;
  interviewId: number;
}): Promise<boolean> {
  const db = getDb();

  const owned = await db
    .select({ id: interviews.id })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.candidateId))
    .innerJoin(requisitions, eq(candidates.requisitionId, requisitions.reqId))
    .where(
      and(
        eq(candidates.organizationId, params.organizationId),
        eq(interviews.id, params.interviewId),
        eq(requisitions.raisedBy, params.managerUserId),
      ),
    )
    .limit(1);
  if (owned.length > 0) {
    return true;
  }

  const panelist = await db
    .select({ id: interviews.id })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.candidateId))
    .innerJoin(
      interviewPanelists,
      eq(interviewPanelists.interviewId, interviews.id),
    )
    .where(
      and(
        eq(candidates.organizationId, params.organizationId),
        eq(interviews.id, params.interviewId),
        eq(interviewPanelists.userId, params.managerUserId),
        isNotNull(interviewPanelists.userId),
      ),
    )
    .limit(1);
  return panelist.length > 0;
}

export async function managerIsPanelistForCandidateItem(params: {
  organizationId: string;
  managerUserId: number;
  candidateId: number;
  requisitionItemId: number;
}): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: interviews.id })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.candidateId))
    .innerJoin(
      interviewPanelists,
      eq(interviewPanelists.interviewId, interviews.id),
    )
    .where(
      and(
        eq(candidates.organizationId, params.organizationId),
        eq(interviews.candidateId, params.candidateId),
        eq(interviews.requisitionItemId, params.requisitionItemId),
        eq(interviewPanelists.userId, params.managerUserId),
        isNotNull(interviewPanelists.userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function deletePanelistsForInterview(
  tx: DbTransaction,
  interviewId: number,
): Promise<void> {
  await tx
    .delete(interviewPanelists)
    .where(eq(interviewPanelists.interviewId, interviewId));
}

export async function insertPanelistRows(
  tx: DbTransaction,
  rows: Array<{
    interviewId: number;
    userId: number;
    displayName: string;
    roleLabel?: string | null;
  }>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await tx.insert(interviewPanelists).values(
    rows.map((r) => ({
      interviewId: r.interviewId,
      userId: r.userId,
      displayName: r.displayName,
      roleLabel: r.roleLabel ?? null,
    })),
  );
}

export async function insertRescheduleRow(
  tx: DbTransaction,
  params: {
    interviewId: number;
    oldScheduledAt: Date | null;
    newScheduledAt: Date | null;
    oldEndTime: Date | null;
    newEndTime: Date | null;
    changedBy: number | null;
    reason: string | null;
  },
): Promise<void> {
  await tx.insert(interviewReschedules).values({
    interviewId: params.interviewId,
    oldScheduledAt: params.oldScheduledAt,
    newScheduledAt: params.newScheduledAt,
    oldEndTime: params.oldEndTime,
    newEndTime: params.newEndTime,
    changedBy: params.changedBy,
    reason: params.reason,
  });
}

export async function updateInterviewFull(
  tx: DbTransaction,
  interviewId: number,
  patch: Partial<{
    interviewerName: string | null;
    scheduledAt: Date;
    endTime: Date;
    timezone: string;
    meetingLink: string | null;
    location: string | null;
    notes: string | null;
    status: string;
    result: string | null;
    feedback: string | null;
    roundName: string | null;
    roundType: string | null;
    interviewMode: string | null;
    updatedBy: number | null;
  }>,
): Promise<InterviewRow | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.interviewerName !== undefined) {
    set.interviewerName = patch.interviewerName;
  }
  if (patch.scheduledAt !== undefined) {
    set.scheduledAt = patch.scheduledAt;
  }
  if (patch.endTime !== undefined) {
    set.endTime = patch.endTime;
  }
  if (patch.timezone !== undefined) {
    set.timezone = patch.timezone;
  }
  if (patch.meetingLink !== undefined) {
    set.meetingLink = patch.meetingLink;
  }
  if (patch.location !== undefined) {
    set.location = patch.location;
  }
  if (patch.notes !== undefined) {
    set.notes = patch.notes;
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
  if (patch.roundName !== undefined) {
    set.roundName = patch.roundName;
  }
  if (patch.roundType !== undefined) {
    set.roundType = patch.roundType;
  }
  if (patch.interviewMode !== undefined) {
    set.interviewMode = patch.interviewMode;
  }
  if (patch.updatedBy !== undefined) {
    set.updatedBy = patch.updatedBy;
  }
  const [row] = await tx
    .update(interviews)
    .set(set)
    .where(eq(interviews.id, interviewId))
    .returning();
  return row ?? null;
}

/** Overlap helper for unit tests: [a0,a1) overlaps [b0,b1) iff a0 < b1 && a1 > b0 */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}
