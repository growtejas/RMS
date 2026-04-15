/**
 * Port of `WorkflowAuditLogger` in `workflow_engine_v2.py` (transition + status history).
 */

import { ALL_REQUISITION_STATUS_VALUES } from "@/lib/workflow/workflow-matrix";
import {
  requisitionStatusHistory,
  workflowTransitionAudit,
} from "@/lib/db/schema";
import {
  AuditWriteException,
  ValidationException,
  WorkflowException,
} from "@/lib/workflow/workflow-exceptions";
import type { AppDb } from "@/lib/workflow/workflow-db";

export async function logWorkflowTransition(
  db: AppDb,
  params: {
    entityType: "requisition" | "requisition_item";
    entityId: number;
    action: string;
    prevStatus: string;
    newStatus: string;
    performedBy: number;
    versionBefore?: number;
    versionAfter?: number;
    userRoles?: string[] | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  const vb = params.versionBefore ?? 0;
  const va = params.versionAfter ?? 0;
  const performedBy =
    params.performedBy > 0 ? params.performedBy : null;
  const meta =
    params.metadata && Object.keys(params.metadata).length > 0
      ? JSON.stringify(params.metadata)
      : null;
  try {
    await db.insert(workflowTransitionAudit).values({
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      fromStatus: params.prevStatus,
      toStatus: params.newStatus,
      versionBefore: vb,
      versionAfter: va,
      performedBy,
      userRoles:
        params.userRoles && params.userRoles.length
          ? params.userRoles.join(",")
          : null,
      reason: params.reason ?? null,
      transitionMetadata: meta,
    });
  } catch (e) {
    throw new AuditWriteException(
      `${params.action} on ${params.entityType}:${params.entityId}`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

export async function logRequisitionStatusHistory(
  db: AppDb,
  params: {
    reqId: number;
    oldStatus: string;
    newStatus: string;
    changedBy: number;
    justification?: string | null;
  },
): Promise<void> {
  if (params.oldStatus == null) {
    throw new WorkflowException(
      "Invalid transition: old_status cannot be NULL",
      "NULL_OLD_STATUS",
      400,
    );
  }
  if (!ALL_REQUISITION_STATUS_VALUES.has(params.oldStatus)) {
    throw new ValidationException(
      "old_status",
      `Invalid status value: ${params.oldStatus}`,
      params.oldStatus,
    );
  }
  if (!ALL_REQUISITION_STATUS_VALUES.has(params.newStatus)) {
    throw new ValidationException(
      "new_status",
      `Invalid status value: ${params.newStatus}`,
      params.newStatus,
    );
  }
  try {
    await db.insert(requisitionStatusHistory).values({
      reqId: params.reqId,
      oldStatus: params.oldStatus,
      newStatus: params.newStatus,
      changedBy: params.changedBy > 0 ? params.changedBy : null,
      justification: params.justification ?? null,
      changedAt: new Date(),
    });
  } catch (e) {
    throw new AuditWriteException(
      `status_history for requisition:${params.reqId}`,
      e instanceof Error ? e.message : String(e),
    );
  }
}
