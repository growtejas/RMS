import {
  and,
  asc,
  desc,
  eq,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  requisitionItems,
  requisitions,
  requisitionStatusHistory,
} from "@/lib/db/schema";

const TA_LIST_STATUSES = ["Approved & Unassigned", "Active", "Fulfilled"] as const;
const TA_MY_ASSIGNMENT_STATUSES = ["Active", "Fulfilled"] as const;

export type RequisitionHeaderRow = typeof requisitions.$inferSelect;
export type RequisitionItemRow = typeof requisitionItems.$inferSelect;

export async function selectRequisitionById(
  reqId: number,
  organizationId: string,
): Promise<RequisitionHeaderRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(requisitions)
    .where(
      and(eq(requisitions.reqId, reqId), eq(requisitions.organizationId, organizationId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function selectItemsForReqId(
  reqId: number,
  organizationId: string,
): Promise<RequisitionItemRow[]> {
  const db = getDb();
  const header = await selectRequisitionById(reqId, organizationId);
  if (!header) {
    return [];
  }
  return db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.reqId, reqId))
    .orderBy(asc(requisitionItems.itemId));
}

export async function listRequisitionsFiltered(input: {
  organizationId: string;
  isTaUser: boolean;
  currentUserId: number;
  myAssignments: boolean;
  assignedToMeAlias: boolean;
  assignedTaFilter: number | null;
  status: string | null;
  raisedBy: number | null;
  limit?: number;
  offset?: number;
}): Promise<RequisitionHeaderRow[]> {
  const db = getDb();
  const myAssignments =
    input.myAssignments || input.assignedToMeAlias;

  const conds: SQL[] = [eq(requisitions.organizationId, input.organizationId)];

  if (input.isTaUser) {
    conds.push(
      inArray(requisitions.overallStatus, [...TA_LIST_STATUSES]),
    );
    if (myAssignments) {
      conds.push(
        inArray(requisitions.overallStatus, [...TA_MY_ASSIGNMENT_STATUSES]),
      );
      conds.push(
        or(
          eq(requisitions.assignedTa, input.currentUserId),
          sql`requisitions.req_id IN (
            SELECT DISTINCT requisition_items.req_id
            FROM requisition_items
            WHERE requisition_items.assigned_ta = ${input.currentUserId}
          )`,
        )!,
      );
    }
  }

  if (input.assignedTaFilter != null) {
    conds.push(eq(requisitions.assignedTa, input.assignedTaFilter));
  }
  if (input.status != null && input.status !== "") {
    conds.push(eq(requisitions.overallStatus, input.status));
  }
  if (input.raisedBy != null) {
    conds.push(eq(requisitions.raisedBy, input.raisedBy));
  }

  const where = conds.length > 0 ? and(...conds) : undefined;

  return db
    .select()
    .from(requisitions)
    .where(where)
    .orderBy(desc(requisitions.reqId))
    .limit(input.limit ?? 200)
    .offset(input.offset ?? 0);
}

export async function listRequisitionsForRaisedBy(
  organizationId: string,
  userId: number,
  params?: { limit?: number; offset?: number },
): Promise<RequisitionHeaderRow[]> {
  const db = getDb();
  return db
    .select()
    .from(requisitions)
    .where(
      and(
        eq(requisitions.organizationId, organizationId),
        eq(requisitions.raisedBy, userId),
      ),
    )
    .orderBy(desc(requisitions.reqId))
    .limit(params?.limit ?? 200)
    .offset(params?.offset ?? 0);
}

export async function selectItemsForReqIds(
  reqIds: number[],
  organizationId: string,
): Promise<RequisitionItemRow[]> {
  if (reqIds.length === 0) {
    return [];
  }
  const db = getDb();
  return db
    .select({ item: requisitionItems })
    .from(requisitionItems)
    .innerJoin(requisitions, eq(requisitionItems.reqId, requisitions.reqId))
    .where(
      and(
        inArray(requisitionItems.reqId, reqIds),
        eq(requisitions.organizationId, organizationId),
      ),
    )
    .orderBy(asc(requisitionItems.itemId))
    .then((rows) => rows.map((r) => r.item));
}

/** FastAPI `GET /api/requisitions/{req_id}/status-history` — newest first. */
export async function listRequisitionStatusHistoryForApi(
  reqId: number,
  params?: { limit?: number; offset?: number },
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(requisitionStatusHistory)
    .where(eq(requisitionStatusHistory.reqId, reqId))
    .orderBy(desc(requisitionStatusHistory.changedAt))
    .limit(params?.limit ?? 200)
    .offset(params?.offset ?? 0);
  return rows.map((r) => ({
    history_id: r.historyId,
    req_id: r.reqId,
    old_status: r.oldStatus,
    new_status: r.newStatus,
    changed_by: r.changedBy ?? null,
    justification: r.justification ?? null,
    changed_at:
      r.changedAt != null
        ? r.changedAt.toISOString()
        : new Date(0).toISOString(),
  }));
}
