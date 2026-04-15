/**
 * PATCH /requisitions/{id}/assign-ta — port of `backend/api/requisitions.py` assign_ta.
 */

import { and, eq, notInArray } from "drizzle-orm";

import type { AppDb } from "@/lib/workflow/workflow-db";
import { HttpError } from "@/lib/http/http-error";
import { hasAnyNormalizedRole } from "@/lib/workflow/workflow-rbac";
import { RequisitionItemWorkflowEngine } from "@/lib/workflow/item-workflow-engine";
import { requisitionItems, requisitions } from "@/lib/db/schema";

const ALLOWED_HEADER_FOR_ASSIGN = ["Active", "Approved & Unassigned"] as const;

export async function assignTaToRequisitionHeader(
  db: AppDb,
  params: {
    reqId: number;
    taUserId: number;
    performedBy: number;
    userRoles: string[];
  },
): Promise<{ message: string; assigned_ta: number }> {
  const isTaOnly =
    hasAnyNormalizedRole(params.userRoles, "TA") &&
    !hasAnyNormalizedRole(params.userRoles, "HR", "Admin");

  if (isTaOnly && params.taUserId !== params.performedBy) {
    throw new HttpError(
      403,
      "TA can only self-assign. To assign another TA, use HR or Admin.",
    );
  }

  const hdrRows = await db
    .select()
    .from(requisitions)
    .where(eq(requisitions.reqId, params.reqId))
    .for("update")
    .limit(1);
  const requisition = hdrRows[0];
  if (!requisition) {
    throw new HttpError(404, "Requisition not found");
  }

  const st = requisition.overallStatus;
  if (!ALLOWED_HEADER_FOR_ASSIGN.includes(st as (typeof ALLOWED_HEADER_FOR_ASSIGN)[number])) {
    throw new HttpError(
      400,
      `Cannot assign TA in status '${st}'. Allowed: ${ALLOWED_HEADER_FOR_ASSIGN.join(", ")}`,
    );
  }

  await db
    .update(requisitions)
    .set({ assignedTa: params.taUserId })
    .where(eq(requisitions.reqId, params.reqId));

  const activeItems = await db
    .select()
    .from(requisitionItems)
    .where(
      and(
        eq(requisitionItems.reqId, params.reqId),
        notInArray(requisitionItems.itemStatus, ["Fulfilled", "Cancelled"]),
      ),
    );

  for (const item of activeItems) {
    if (item.assignedTa == null) {
      await RequisitionItemWorkflowEngine.assignTa(db, {
        itemId: item.itemId,
        taUserId: params.taUserId,
        performedBy: params.performedBy,
        userRoles: params.userRoles,
      });
      continue;
    }
    if (item.assignedTa === params.taUserId) {
      continue;
    }
    if (hasAnyNormalizedRole(params.userRoles, "HR", "Admin")) {
      await RequisitionItemWorkflowEngine.swapTa(db, {
        itemId: item.itemId,
        newTaId: params.taUserId,
        userId: params.performedBy,
        userRoles: params.userRoles,
        reason: "Header TA assignment synchronization",
      });
    }
  }

  if (requisition.overallStatus === "Approved & Unassigned") {
    await db
      .update(requisitions)
      .set({ overallStatus: "Active" })
      .where(eq(requisitions.reqId, params.reqId));
  }

  return { message: "TA assigned", assigned_ta: params.taUserId };
}
