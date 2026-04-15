/**
 * Port of `RequisitionWorkflowEngine` in `workflow_engine_v2.py`.
 */

import { and, eq, notInArray } from "drizzle-orm";

import type { RequisitionStatus } from "@/types/workflow";
import { logRequisitionStatusHistory, logWorkflowTransition } from "@/lib/workflow/workflow-audit";
import type { AppDb } from "@/lib/workflow/workflow-db";
import {
  AuthorizationException,
  ConcurrencyConflictException,
  EntityNotFoundException,
  InvalidTransitionException,
  SystemOnlyTransitionException,
  TerminalStateException,
  ValidationException,
} from "@/lib/workflow/workflow-exceptions";
import {
  HEADER_TRANSITIONS,
  type SystemRoleName,
  getHeaderAuthorizedRoles,
  isHeaderTerminal,
  isSystemOnlyHeaderTransition,
  isValidHeaderTransition,
} from "@/lib/workflow/workflow-matrix";
import { userRolesToSystemRoles } from "@/lib/workflow/workflow-rbac";
import { requisitionItems, requisitions } from "@/lib/db/schema";

import type { RequisitionItemStatus } from "@/types/workflow";

const RS = {
  DRAFT: "Draft",
  PENDING_BUDGET: "Pending_Budget",
  PENDING_HR: "Pending_HR",
  ACTIVE: "Active",
  FULFILLED: "Fulfilled",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
} as const satisfies Record<string, RequisitionStatus>;

const IS = {
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
} as const satisfies Record<string, RequisitionItemStatus>;

const MIN_REASON = 10;

function parseHeaderStatus(statusValue: string): RequisitionStatus {
  const valid: RequisitionStatus[] = [
    RS.DRAFT,
    RS.PENDING_BUDGET,
    RS.PENDING_HR,
    RS.ACTIVE,
    RS.FULFILLED,
    RS.REJECTED,
    RS.CANCELLED,
  ];
  if (!valid.includes(statusValue as RequisitionStatus)) {
    throw new ValidationException(
      "overall_status",
      `Invalid status value: ${statusValue}`,
      statusValue,
    );
  }
  return statusValue as RequisitionStatus;
}

function validateHeaderTransition(
  current: RequisitionStatus,
  target: RequisitionStatus,
  userRoles: string[],
  isSystem = false,
): void {
  if (isHeaderTerminal(current)) {
    throw new TerminalStateException(current, "requisition");
  }
  if (!isValidHeaderTransition(current, target)) {
    const allowed = HEADER_TRANSITIONS[current];
    throw new InvalidTransitionException(
      current,
      target,
      "requisition",
      allowed ? Array.from(allowed) : [],
    );
  }
  if (isSystemOnlyHeaderTransition(current, target)) {
    if (!isSystem) {
      throw new SystemOnlyTransitionException(current, target, "requisition");
    }
    return;
  }
  const authorized = getHeaderAuthorizedRoles(current, target);
  const userSys = userRolesToSystemRoles(userRoles);
  let ok = false;
  for (const r of Array.from(userSys)) {
    if (authorized.has(r as SystemRoleName)) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    throw new AuthorizationException(
      `transition requisition from ${current} to ${target}`,
      userRoles,
      Array.from(authorized),
    );
  }
}

function validateVersion(
  row: { reqId: number; version: number | null },
  expected: number | null | undefined,
): void {
  if (expected == null) {
    return;
  }
  const cur = row.version ?? 0;
  if (cur !== expected) {
    throw new ConcurrencyConflictException(
      "requisition",
      row.reqId,
      expected,
      cur,
    );
  }
}

async function lockRequisition(db: AppDb, reqId: number) {
  const rows = await db
    .select()
    .from(requisitions)
    .where(eq(requisitions.reqId, reqId))
    .for("update")
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new EntityNotFoundException("requisition", reqId);
  }
  return row;
}

export const RequisitionWorkflowEngine = {
  MIN_REASON_LENGTH: MIN_REASON,

  async submit(
    db: AppDb,
    params: {
      reqId: number;
      userId: number;
      userRoles: string[];
      expectedVersion?: number | null;
    },
  ) {
    const reqRow = await lockRequisition(db, params.reqId);
    const current = parseHeaderStatus(reqRow.overallStatus);
    const target = RS.PENDING_BUDGET;
    validateVersion(reqRow, params.expectedVersion);
    validateHeaderTransition(current, target, params.userRoles);

    const oldStatus = reqRow.overallStatus;
    const versionBefore = reqRow.version ?? 1;
    const versionAfter = versionBefore + 1;

    await db
      .update(requisitions)
      .set({
        overallStatus: target,
        version: versionAfter,
      })
      .where(eq(requisitions.reqId, params.reqId));

    await logWorkflowTransition(db, {
      entityType: "requisition",
      entityId: params.reqId,
      action: "SUBMIT",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      versionBefore,
      versionAfter,
      userRoles: params.userRoles,
    });
    await logRequisitionStatusHistory(db, {
      reqId: params.reqId,
      oldStatus,
      newStatus: target,
      changedBy: params.userId,
    });

    return { ...reqRow, overallStatus: target, version: versionAfter };
  },

  async approveBudget(
    db: AppDb,
    params: {
      reqId: number;
      userId: number;
      userRoles: string[];
      expectedVersion?: number | null;
    },
  ) {
    const reqRow = await lockRequisition(db, params.reqId);
    const current = parseHeaderStatus(reqRow.overallStatus);
    const target = RS.PENDING_HR;
    validateVersion(reqRow, params.expectedVersion);
    validateHeaderTransition(current, target, params.userRoles);

    const oldStatus = reqRow.overallStatus;
    const vb = reqRow.version ?? 1;
    const va = vb + 1;

    await db
      .update(requisitions)
      .set({
        overallStatus: target,
        budgetApprovedBy: params.userId,
        version: va,
      })
      .where(eq(requisitions.reqId, params.reqId));

    await logWorkflowTransition(db, {
      entityType: "requisition",
      entityId: params.reqId,
      action: "APPROVE_BUDGET",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      versionBefore: vb,
      versionAfter: va,
    });
    await logRequisitionStatusHistory(db, {
      reqId: params.reqId,
      oldStatus,
      newStatus: target,
      changedBy: params.userId,
    });

    return { ...reqRow, overallStatus: target, version: va, budgetApprovedBy: params.userId };
  },

  async approveHr(
    db: AppDb,
    params: {
      reqId: number;
      userId: number;
      userRoles: string[];
      expectedVersion?: number | null;
    },
  ) {
    const reqRow = await lockRequisition(db, params.reqId);
    const current = parseHeaderStatus(reqRow.overallStatus);
    const target = RS.ACTIVE;
    validateVersion(reqRow, params.expectedVersion);
    validateHeaderTransition(current, target, params.userRoles);

    const oldStatus = reqRow.overallStatus;
    const vb = reqRow.version ?? 1;
    const va = vb + 1;
    const now = new Date();

    await db
      .update(requisitions)
      .set({
        overallStatus: target,
        approvedBy: params.userId,
        approvalHistory: now,
        version: va,
      })
      .where(eq(requisitions.reqId, params.reqId));

    await logWorkflowTransition(db, {
      entityType: "requisition",
      entityId: params.reqId,
      action: "APPROVE_HR",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      versionBefore: vb,
      versionAfter: va,
    });
    await logRequisitionStatusHistory(db, {
      reqId: params.reqId,
      oldStatus,
      newStatus: target,
      changedBy: params.userId,
    });

    return { ...reqRow, overallStatus: target, version: va, approvedBy: params.userId, approvalHistory: now };
  },

  async reject(
    db: AppDb,
    params: {
      reqId: number;
      userId: number;
      userRoles: string[];
      reason: string;
      expectedVersion?: number | null;
    },
  ) {
    const reason = (params.reason ?? "").trim();
    if (reason.length < MIN_REASON) {
      throw new ValidationException(
        "reason",
        `Rejection reason must be at least ${MIN_REASON} characters`,
        reason,
      );
    }
    const reqRow = await lockRequisition(db, params.reqId);
    const current = parseHeaderStatus(reqRow.overallStatus);
    const target = RS.REJECTED;
    validateVersion(reqRow, params.expectedVersion);
    validateHeaderTransition(current, target, params.userRoles);

    const oldStatus = reqRow.overallStatus;
    const vb = reqRow.version ?? 1;
    const va = vb + 1;

    await db
      .update(requisitions)
      .set({
        overallStatus: target,
        rejectionReason: reason,
        version: va,
      })
      .where(eq(requisitions.reqId, params.reqId));

    await logWorkflowTransition(db, {
      entityType: "requisition",
      entityId: params.reqId,
      action: "REJECT",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      versionBefore: vb,
      versionAfter: va,
      reason,
    });
    await logRequisitionStatusHistory(db, {
      reqId: params.reqId,
      oldStatus,
      newStatus: target,
      changedBy: params.userId,
      justification: reason,
    });

    return { ...reqRow, overallStatus: target, version: va, rejectionReason: reason };
  },

  async cancel(
    db: AppDb,
    params: {
      reqId: number;
      userId: number;
      userRoles: string[];
      reason: string;
      expectedVersion?: number | null;
    },
  ) {
    const reason = (params.reason ?? "").trim();
    if (reason.length < MIN_REASON) {
      throw new ValidationException(
        "reason",
        `Cancellation reason must be at least ${MIN_REASON} characters`,
        reason,
      );
    }
    const reqRow = await lockRequisition(db, params.reqId);
    const current = parseHeaderStatus(reqRow.overallStatus);
    const target = RS.CANCELLED;
    validateVersion(reqRow, params.expectedVersion);
    validateHeaderTransition(current, target, params.userRoles);

    const items = await db
      .select()
      .from(requisitionItems)
      .where(
        and(
          eq(requisitionItems.reqId, params.reqId),
          notInArray(requisitionItems.itemStatus, [IS.FULFILLED, IS.CANCELLED]),
        ),
      )
      .for("update");

    for (const it of items) {
      await db
        .update(requisitionItems)
        .set({ itemStatus: IS.CANCELLED })
        .where(eq(requisitionItems.itemId, it.itemId));
    }

    const oldStatus = reqRow.overallStatus;
    const vb = reqRow.version ?? 1;
    const va = vb + 1;

    await db
      .update(requisitions)
      .set({ overallStatus: target, version: va })
      .where(eq(requisitions.reqId, params.reqId));

    await logWorkflowTransition(db, {
      entityType: "requisition",
      entityId: params.reqId,
      action: "CANCEL",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      versionBefore: vb,
      versionAfter: va,
      reason,
      metadata: { cancelled_items: items.length },
    });
    await logRequisitionStatusHistory(db, {
      reqId: params.reqId,
      oldStatus,
      newStatus: target,
      changedBy: params.userId,
      justification: reason,
    });

    return { ...reqRow, overallStatus: target, version: va };
  },

  async reopenForRevision(
    db: AppDb,
    params: {
      reqId: number;
      userId: number;
      userRoles: string[];
      reason?: string | null;
      expectedVersion?: number | null;
    },
  ) {
    const reqRow = await lockRequisition(db, params.reqId);
    const current = parseHeaderStatus(reqRow.overallStatus);
    const target = RS.DRAFT;
    validateVersion(reqRow, params.expectedVersion);
    validateHeaderTransition(current, target, params.userRoles);

    const oldStatus = reqRow.overallStatus;
    const vb = reqRow.version ?? 1;
    const va = vb + 1;
    const reason = params.reason?.trim() ?? null;

    await db
      .update(requisitions)
      .set({
        overallStatus: target,
        version: va,
        budgetApprovedBy: null,
        approvedBy: null,
      })
      .where(eq(requisitions.reqId, params.reqId));

    await logWorkflowTransition(db, {
      entityType: "requisition",
      entityId: params.reqId,
      action: "REOPEN_FOR_REVISION",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      versionBefore: vb,
      versionAfter: va,
      reason: reason ?? undefined,
      metadata: { resubmission: true },
    });
    await logRequisitionStatusHistory(db, {
      reqId: params.reqId,
      oldStatus,
      newStatus: target,
      changedBy: params.userId,
      justification: reason ?? "Reopened for revision after rejection",
    });

    return { ...reqRow, overallStatus: target, version: va, budgetApprovedBy: null, approvedBy: null };
  },

  /** Python `_get_locked_requisition` — exposed for routes that need `old_status` before transition. */
  lockRequisition,

  parseHeaderStatus,

  async recalculateHeaderStatus(
    db: AppDb,
    params: { reqId: number; changedBy?: number | null },
  ): Promise<RequisitionStatus | null> {
    const reqRow = await lockRequisition(db, params.reqId);
    const current = parseHeaderStatus(reqRow.overallStatus);
    if (
      current === RS.DRAFT ||
      current === RS.PENDING_BUDGET ||
      current === RS.PENDING_HR ||
      current === RS.REJECTED ||
      current === RS.CANCELLED
    ) {
      return null;
    }
    if (current !== RS.ACTIVE) {
      return null;
    }

    const items = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.reqId, params.reqId));

    const total = items.length;
    let newStatus: RequisitionStatus;
    if (total === 0) {
      newStatus = RS.CANCELLED;
    } else {
      let fulfilled = 0;
      let cancelled = 0;
      for (const it of items) {
        if (it.itemStatus === "Fulfilled") {
          fulfilled++;
        } else if (it.itemStatus === "Cancelled") {
          cancelled++;
        }
      }
      const active = total - fulfilled - cancelled;
      if (active === 0 && fulfilled > 0) {
        newStatus = RS.FULFILLED;
      } else if (active === 0 && fulfilled === 0) {
        newStatus = RS.CANCELLED;
      } else {
        newStatus = RS.ACTIVE;
      }
    }

    if (newStatus === current) {
      return null;
    }

    const oldStatus = reqRow.overallStatus;
    const vb = reqRow.version ?? 1;
    const va = vb + 1;
    const performedBy = params.changedBy ?? 0;

    await db
      .update(requisitions)
      .set({ overallStatus: newStatus, version: va })
      .where(eq(requisitions.reqId, params.reqId));

    await logWorkflowTransition(db, {
      entityType: "requisition",
      entityId: params.reqId,
      action: "AUTO_RECALCULATE",
      prevStatus: oldStatus,
      newStatus: newStatus,
      performedBy,
      versionBefore: vb,
      versionAfter: va,
      metadata: { trigger: "item_status_change" },
    });
    await logRequisitionStatusHistory(db, {
      reqId: params.reqId,
      oldStatus,
      newStatus: newStatus,
      changedBy: performedBy,
      justification: "Automatic status recalculation based on item statuses",
    });

    return newStatus;
  },
};
