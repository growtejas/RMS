/**
 * Read-side workflow audit + stats — port of `backend/api/workflow_audit.py` query logic.
 */

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  or,
  sql,
} from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  requisitionItems,
  requisitions,
  users,
  workflowTransitionAudit,
} from "@/lib/db/schema";

export type AuditLogEntryJson = {
  audit_id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  from_status: string;
  to_status: string;
  version_before: number;
  version_after: number;
  performed_by: number | null;
  performed_by_username: string | null;
  performed_by_full_name: string | null;
  user_roles: string | null;
  reason: string | null;
  transition_metadata: string | null;
  created_at: string;
};

function mapRow(
  row: typeof workflowTransitionAudit.$inferSelect,
  performerUsername: string | null,
): AuditLogEntryJson {
  return {
    audit_id: row.auditId,
    entity_type: row.entityType,
    entity_id: row.entityId,
    action: row.action,
    from_status: row.fromStatus ?? "",
    to_status: row.toStatus,
    version_before: row.versionBefore ?? 0,
    version_after: row.versionAfter ?? 0,
    performed_by: row.performedBy,
    performed_by_username: performerUsername,
    performed_by_full_name: performerUsername,
    user_roles: row.userRoles,
    reason: row.reason,
    transition_metadata: row.transitionMetadata,
    created_at:
      row.createdAt instanceof Date ?
        row.createdAt.toISOString()
      : String(row.createdAt),
  };
}

export async function getRequisitionAuditLog(params: {
  reqId: number;
  includeItems: boolean;
  page: number;
  pageSize: number;
}): Promise<{
  total: number;
  page: number;
  page_size: number;
  entries: AuditLogEntryJson[];
  notFound?: boolean;
}> {
  const db = getDb();
  const reqRows = await db
    .select()
    .from(requisitions)
    .where(eq(requisitions.reqId, params.reqId))
    .limit(1);
  if (!reqRows[0]) {
    return {
      total: 0,
      page: params.page,
      page_size: params.pageSize,
      entries: [],
      notFound: true,
    };
  }

  const headerCond = and(
    eq(workflowTransitionAudit.entityType, "requisition"),
    eq(workflowTransitionAudit.entityId, params.reqId),
  )!;

  let whereClause;
  if (!params.includeItems) {
    whereClause = headerCond;
  } else {
    const itemRows = await db
      .select({ itemId: requisitionItems.itemId })
      .from(requisitionItems)
      .where(eq(requisitionItems.reqId, params.reqId));
    const itemIds = itemRows.map((r) => r.itemId);
    whereClause =
      itemIds.length ?
        or(
          headerCond,
          and(
            eq(workflowTransitionAudit.entityType, "requisition_item"),
            inArray(workflowTransitionAudit.entityId, itemIds),
          )!,
        )!
      : headerCond;
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workflowTransitionAudit)
    .where(whereClause);
  const total = countRow?.count ?? 0;

  const offset = (params.page - 1) * params.pageSize;
  const rows = await db
    .select({
      audit: workflowTransitionAudit,
      performerUsername: users.username,
    })
    .from(workflowTransitionAudit)
    .leftJoin(
      users,
      eq(workflowTransitionAudit.performedBy, users.userId),
    )
    .where(whereClause)
    .orderBy(desc(workflowTransitionAudit.createdAt))
    .limit(params.pageSize)
    .offset(offset);

  return {
    total,
    page: params.page,
    page_size: params.pageSize,
    entries: rows.map((r) =>
      mapRow(r.audit, r.performerUsername ?? null),
    ),
  };
}

export async function getItemAuditLog(params: {
  itemId: number;
  page: number;
  pageSize: number;
}): Promise<{
  total: number;
  page: number;
  page_size: number;
  entries: AuditLogEntryJson[];
  notFound?: boolean;
}> {
  const db = getDb();
  const item = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.itemId, params.itemId))
    .limit(1);
  if (!item[0]) {
    return {
      total: 0,
      page: params.page,
      page_size: params.pageSize,
      entries: [],
      notFound: true,
    };
  }

  const whereClause = and(
    eq(workflowTransitionAudit.entityType, "requisition_item"),
    eq(workflowTransitionAudit.entityId, params.itemId),
  )!;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workflowTransitionAudit)
    .where(whereClause);
  const total = countRow?.count ?? 0;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await db
    .select()
    .from(workflowTransitionAudit)
    .where(whereClause)
    .orderBy(desc(workflowTransitionAudit.createdAt))
    .limit(params.pageSize)
    .offset(offset);

  return {
    total,
    page: params.page,
    page_size: params.pageSize,
    entries: rows.map((r) => mapRow(r, null)),
  };
}

export async function getUserAuditLog(params: {
  userId: number;
  entityType: string | null;
  since: Date | null;
  page: number;
  pageSize: number;
}): Promise<{
  total: number;
  page: number;
  page_size: number;
  entries: AuditLogEntryJson[];
}> {
  const db = getDb();
  const conds = [eq(workflowTransitionAudit.performedBy, params.userId)];
  if (params.entityType) {
    conds.push(eq(workflowTransitionAudit.entityType, params.entityType));
  }
  if (params.since) {
    conds.push(gte(workflowTransitionAudit.createdAt, params.since));
  }
  const whereClause = and(...conds)!;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workflowTransitionAudit)
    .where(whereClause);
  const total = countRow?.count ?? 0;
  const offset = (params.page - 1) * params.pageSize;

  const rows = await db
    .select()
    .from(workflowTransitionAudit)
    .where(whereClause)
    .orderBy(desc(workflowTransitionAudit.createdAt))
    .limit(params.pageSize)
    .offset(offset);

  return {
    total,
    page: params.page,
    page_size: params.pageSize,
    entries: rows.map((r) => mapRow(r, null)),
  };
}

export async function getLastTransitionTime(): Promise<Date | null> {
  const db = getDb();
  const rows = await db
    .select({ createdAt: workflowTransitionAudit.createdAt })
    .from(workflowTransitionAudit)
    .orderBy(desc(workflowTransitionAudit.createdAt))
    .limit(1);
  const t = rows[0]?.createdAt;
  return t instanceof Date ? t : t ? new Date(t) : null;
}

export async function getTransitionStats(params: { days: number }): Promise<{
  period_days: number;
  since: string;
  by_action: { action: string; entity_type: string; count: number }[];
  by_day: { date: string; count: number }[];
  top_users: { user_id: number; count: number }[];
}> {
  const db = getDb();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - params.days);

  const byActionRows = await db
    .select({
      action: workflowTransitionAudit.action,
      entityType: workflowTransitionAudit.entityType,
      count: sql<number>`count(${workflowTransitionAudit.auditId})::int`,
    })
    .from(workflowTransitionAudit)
    .where(gte(workflowTransitionAudit.createdAt, since))
    .groupBy(
      workflowTransitionAudit.action,
      workflowTransitionAudit.entityType,
    )
    .orderBy(desc(sql`count(${workflowTransitionAudit.auditId})`));

  const byDayRows = await db
    .select({
      date: sql<string>`date(${workflowTransitionAudit.createdAt})::text`,
      count: sql<number>`count(${workflowTransitionAudit.auditId})::int`,
    })
    .from(workflowTransitionAudit)
    .where(gte(workflowTransitionAudit.createdAt, since))
    .groupBy(sql`date(${workflowTransitionAudit.createdAt})`)
    .orderBy(sql`date(${workflowTransitionAudit.createdAt})`);

  const topUsersRows = await db
    .select({
      performedBy: workflowTransitionAudit.performedBy,
      count: sql<number>`count(${workflowTransitionAudit.auditId})::int`,
    })
    .from(workflowTransitionAudit)
    .where(
      and(
        gte(workflowTransitionAudit.createdAt, since),
        sql`${workflowTransitionAudit.performedBy} is not null`,
      )!,
    )
    .groupBy(workflowTransitionAudit.performedBy)
    .orderBy(desc(sql`count(${workflowTransitionAudit.auditId})`))
    .limit(10);

  return {
    period_days: params.days,
    since: since.toISOString(),
    by_action: byActionRows.map((r) => ({
      action: r.action,
      entity_type: r.entityType,
      count: r.count,
    })),
    by_day: byDayRows.map((r) => ({
      date: String(r.date),
      count: r.count,
    })),
    top_users: topUsersRows
      .filter((r) => r.performedBy != null)
      .map((r) => ({
        user_id: r.performedBy!,
        count: r.count,
      })),
  };
}
