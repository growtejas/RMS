/**
 * Port of `RequisitionItemWorkflowEngine` (+ `_recalculate_header_budget_status`) in `workflow_engine_v2.py`.
 */

import { and, eq, inArray, ne, sql } from "drizzle-orm";

import type { RequisitionItemStatus, RequisitionStatus } from "@/types/workflow";
import { findEmployeeByEmpIdDb } from "@/lib/repositories/employees-core";
import { logRequisitionStatusHistory, logWorkflowTransition } from "@/lib/workflow/workflow-audit";
import type { AppDb } from "@/lib/workflow/workflow-db";
import {
  AuthorizationException,
  EntityLockedException,
  EntityNotFoundException,
  InvalidTransitionException,
  PrerequisiteException,
  ReasonRequiredException,
  SystemOnlyTransitionException,
  TerminalStateException,
  ValidationException,
} from "@/lib/workflow/workflow-exceptions";
import {
  ITEM_BUDGET_APPROVABLE_HEADER_STATES,
  ITEM_BUDGET_APPROVE_AUTHORITY,
  ITEM_BUDGET_EDITABLE_HEADER_STATES,
  ITEM_BUDGET_EDIT_AUTHORITY,
  ITEM_BUDGET_REJECT_AUTHORITY,
  ITEM_TRANSITIONS,
  ITEM_STATUS_CHANGE_ALLOWED_HEADER_STATES,
  type SystemRoleName,
  getItemAuthorizedRoles,
  isBackwardItemTransition,
  isItemTerminal,
  isSystemOnlyItemTransition,
  isValidItemTransition,
} from "@/lib/workflow/workflow-matrix";
import { hasAnyNormalizedRole, userRolesToSystemRoles } from "@/lib/workflow/workflow-rbac";
import { RequisitionWorkflowEngine } from "@/lib/workflow/requisition-workflow-engine";
import { requisitionItems, requisitions } from "@/lib/db/schema";

const IS = {
  PENDING: "Pending",
  SOURCING: "Sourcing",
  SHORTLISTED: "Shortlisted",
  INTERVIEWING: "Interviewing",
  OFFERED: "Offered",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
} as const satisfies Record<string, RequisitionItemStatus>;

const RS = {
  PENDING_BUDGET: "Pending_Budget",
  PENDING_HR: "Pending_HR",
} as const satisfies Record<string, RequisitionStatus>;

const MIN_REASON = 10;
const MIN_SWAP_REASON = 5;
const MIN_BULK_REASON = 5;

function parseItemStatus(statusValue: string): RequisitionItemStatus {
  const all: RequisitionItemStatus[] = [
    IS.PENDING,
    IS.SOURCING,
    IS.SHORTLISTED,
    IS.INTERVIEWING,
    IS.OFFERED,
    IS.FULFILLED,
    IS.CANCELLED,
  ];
  if (!all.includes(statusValue as RequisitionItemStatus)) {
    throw new ValidationException(
      "item_status",
      `Invalid status value: ${statusValue}`,
      statusValue,
    );
  }
  return statusValue as RequisitionItemStatus;
}

function validateItemTransition(
  current: RequisitionItemStatus,
  target: RequisitionItemStatus,
  userRoles: string[],
  reason: string | null | undefined,
  isSystem = false,
): void {
  if (isItemTerminal(current)) {
    throw new TerminalStateException(current, "requisition_item");
  }
  if (!isValidItemTransition(current, target)) {
    const allowed = ITEM_TRANSITIONS[current];
    throw new InvalidTransitionException(
      current,
      target,
      "requisition_item",
      allowed ? Array.from(allowed) : [],
    );
  }
  if (isBackwardItemTransition(current, target)) {
    const r = (reason ?? "").trim();
    if (r.length < MIN_REASON) {
      throw new ReasonRequiredException(current, target, MIN_REASON);
    }
  }
  if (isSystemOnlyItemTransition(current, target)) {
    if (!isSystem) {
      throw new SystemOnlyTransitionException(current, target, "requisition_item");
    }
    return;
  }
  const authorized = getItemAuthorizedRoles(current, target);
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
      `transition item from ${current} to ${target}`,
      userRoles,
      Array.from(authorized),
    );
  }
}

async function validateHeaderAllowsItemChange(db: AppDb, reqId: number) {
  const rows = await db
    .select()
    .from(requisitions)
    .where(eq(requisitions.reqId, reqId))
    .limit(1);
  const header = rows[0];
  if (!header) {
    throw new EntityNotFoundException("requisition", reqId);
  }
  const st = RequisitionWorkflowEngine.parseHeaderStatus(header.overallStatus);
  if (!ITEM_STATUS_CHANGE_ALLOWED_HEADER_STATES.has(st)) {
    throw new EntityLockedException(
      "requisition_item",
      reqId,
      `Parent requisition is in '${header.overallStatus}' status. Item status changes only allowed when header is ACTIVE.`,
    );
  }
  return header;
}

async function lockItem(db: AppDb, itemId: number) {
  const rows = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.itemId, itemId))
    .for("update")
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new EntityNotFoundException("requisition_item", itemId);
  }
  return row;
}

async function validateAssignedTa(
  db: AppDb,
  item: typeof requisitionItems.$inferSelect,
  userId: number,
  userRoles: string[],
) {
  if (hasAnyNormalizedRole(userRoles, "HR", "Admin")) {
    return;
  }
  if (!hasAnyNormalizedRole(userRoles, "TA")) {
    return;
  }
  let assignedTaId = item.assignedTa;
  if (assignedTaId == null) {
    const hdr = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.reqId, item.reqId))
      .limit(1);
    assignedTaId = hdr[0]?.assignedTa ?? null;
  }
  if (assignedTaId == null) {
    throw new AuthorizationException(
      "modify unassigned item",
      userRoles,
      ["HR", "Admin"],
      "Item has no TA assigned. Only HR or Admin can modify.",
    );
  }
  if (assignedTaId !== userId) {
    throw new AuthorizationException(
      "modify item assigned to another TA",
      userRoles,
      ["HR", "Admin"],
      `You are not the assigned TA for this item. Assigned TA ID: ${assignedTaId}`,
    );
  }
}

function incItemVersion(current: number | null) {
  return (current ?? 0) + 1;
}

async function recalculateHeaderBudgetStatus(
  db: AppDb,
  reqRow: typeof requisitions.$inferSelect,
  changedBy: number,
  userRoles: string[],
): Promise<RequisitionStatus | null> {
  const current = RequisitionWorkflowEngine.parseHeaderStatus(reqRow.overallStatus);
  if (current !== RS.PENDING_BUDGET) {
    return null;
  }
  const items = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.reqId, reqRow.reqId));

  if (!items.length) {
    return null;
  }
  const allApproved = items.every(
    (it) =>
      it.approvedBudget != null &&
      it.approvedBudget !== "" &&
      Number(it.approvedBudget) > 0,
  );
  if (!allApproved) {
    return null;
  }

  const target = "Pending_HR";
  const oldStatus = reqRow.overallStatus;
  const vb = reqRow.version ?? 1;
  const va = vb + 1;
  const totalEstimated = items.reduce(
    (s, i) => s + Number(i.estimatedBudget ?? 0),
    0,
  );
  const totalApproved = items.reduce(
    (s, i) => s + Number(i.approvedBudget ?? 0),
    0,
  );

  await db
    .update(requisitions)
    .set({
      overallStatus: target,
      budgetApprovedBy: changedBy,
      version: va,
    })
    .where(eq(requisitions.reqId, reqRow.reqId));

  await logWorkflowTransition(db, {
    entityType: "requisition",
    entityId: reqRow.reqId,
    action: "ALL_BUDGETS_APPROVED",
    prevStatus: oldStatus,
    newStatus: target,
    performedBy: changedBy,
    versionBefore: vb,
    versionAfter: va,
    userRoles,
    metadata: {
      trigger: "all_item_budgets_approved",
      total_estimated_budget: totalEstimated,
      total_approved_budget: totalApproved,
      item_count: items.length,
    },
  });
  await logRequisitionStatusHistory(db, {
    reqId: reqRow.reqId,
    oldStatus,
    newStatus: target,
    changedBy,
    justification: "All item budgets approved",
  });

  return target as RequisitionStatus;
}

export const RequisitionItemWorkflowEngine = {
  MIN_REASON_LENGTH: MIN_REASON,

  lockItem,

  async assignTa(
    db: AppDb,
    params: {
      itemId: number;
      taUserId: number;
      performedBy: number;
      userRoles: string[];
    },
  ) {
    if (!hasAnyNormalizedRole(params.userRoles, "HR", "Admin")) {
      if (!hasAnyNormalizedRole(params.userRoles, "TA")) {
        throw new AuthorizationException(
          "assign TA to item",
          params.userRoles,
          ["HR", "Admin", "TA"],
        );
      }
      if (params.taUserId !== params.performedBy) {
        throw new AuthorizationException(
          "assign another TA to item",
          params.userRoles,
          ["HR", "Admin"],
          "TA can only self-assign. To assign another TA, use HR or Admin.",
        );
      }
    }

    const item = await lockItem(db, params.itemId);
    await validateHeaderAllowsItemChange(db, item.reqId);

    const current = parseItemStatus(item.itemStatus);
    if (item.assignedTa != null) {
      throw new ValidationException(
        "assigned_ta",
        "TA already assigned to this item",
        item.assignedTa,
      );
    }
    if (isItemTerminal(current)) {
      throw new TerminalStateException(current, "requisition_item", params.itemId);
    }

    await db
      .update(requisitionItems)
      .set({ assignedTa: params.taUserId })
      .where(eq(requisitionItems.itemId, params.itemId));

    const updated = { ...item, assignedTa: params.taUserId };

    if (current === IS.PENDING) {
      const oldStatus = updated.itemStatus;
      await db
        .update(requisitionItems)
        .set({ itemStatus: IS.SOURCING })
        .where(eq(requisitionItems.itemId, params.itemId));
      await logWorkflowTransition(db, {
        entityType: "requisition_item",
        entityId: params.itemId,
        action: "TA_ASSIGN_AUTO_SOURCING",
        prevStatus: oldStatus,
        newStatus: IS.SOURCING,
        performedBy: params.performedBy,
        metadata: { ta_user_id: params.taUserId, trigger: "GC-003" },
      });
    } else {
      await logWorkflowTransition(db, {
        entityType: "requisition_item",
        entityId: params.itemId,
        action: "TA_ASSIGN",
        prevStatus: updated.itemStatus,
        newStatus: updated.itemStatus,
        performedBy: params.performedBy,
        metadata: { ta_user_id: params.taUserId },
      });
    }

    await RequisitionWorkflowEngine.recalculateHeaderStatus(db, {
      reqId: item.reqId,
      changedBy: params.performedBy,
    });

    const finalRows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return finalRows[0]!;
  },

  async shortlist(
    db: AppDb,
    params: {
      itemId: number;
      userId: number;
      userRoles: string[];
      candidateCount?: number | null;
    },
  ) {
    const item = await lockItem(db, params.itemId);
    await validateHeaderAllowsItemChange(db, item.reqId);
    await validateAssignedTa(db, item, params.userId, params.userRoles);

    const current = parseItemStatus(item.itemStatus);
    const target = IS.SHORTLISTED;
    validateItemTransition(current, target, params.userRoles, null);

    const oldStatus = item.itemStatus;
    await db
      .update(requisitionItems)
      .set({ itemStatus: target })
      .where(eq(requisitionItems.itemId, params.itemId));

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "SHORTLIST",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      metadata:
        params.candidateCount != null
          ? { candidate_count: params.candidateCount }
          : undefined,
    });

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },

  async startInterview(
    db: AppDb,
    params: { itemId: number; userId: number; userRoles: string[] },
  ) {
    const item = await lockItem(db, params.itemId);
    await validateHeaderAllowsItemChange(db, item.reqId);
    await validateAssignedTa(db, item, params.userId, params.userRoles);

    const current = parseItemStatus(item.itemStatus);
    const target = IS.INTERVIEWING;
    validateItemTransition(current, target, params.userRoles, null);

    const oldStatus = item.itemStatus;
    await db
      .update(requisitionItems)
      .set({ itemStatus: target })
      .where(eq(requisitionItems.itemId, params.itemId));

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "START_INTERVIEW",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
    });

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },

  async makeOffer(
    db: AppDb,
    params: {
      itemId: number;
      userId: number;
      userRoles: string[];
      candidateId?: string | null;
      offerDetails?: Record<string, unknown> | null;
    },
  ) {
    const item = await lockItem(db, params.itemId);
    await validateHeaderAllowsItemChange(db, item.reqId);
    await validateAssignedTa(db, item, params.userId, params.userRoles);

    const current = parseItemStatus(item.itemStatus);
    const target = IS.OFFERED;
    validateItemTransition(current, target, params.userRoles, null);

    const oldStatus = item.itemStatus;
    await db
      .update(requisitionItems)
      .set({ itemStatus: target })
      .where(eq(requisitionItems.itemId, params.itemId));

    const metadata: Record<string, unknown> = {};
    if (params.candidateId) {
      metadata.candidate_id = params.candidateId;
    }
    if (params.offerDetails) {
      metadata.offer_details = params.offerDetails;
    }

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "MAKE_OFFER",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    });

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },

  async fulfill(
    db: AppDb,
    params: {
      itemId: number;
      userId: number;
      userRoles: string[];
      employeeId: string;
    },
  ) {
    const item = await lockItem(db, params.itemId);
    await validateHeaderAllowsItemChange(db, item.reqId);
    await validateAssignedTa(db, item, params.userId, params.userRoles);

    const current = parseItemStatus(item.itemStatus);
    const target = IS.FULFILLED;
    validateItemTransition(current, target, params.userRoles, null);

    const emp = await findEmployeeByEmpIdDb(db, params.employeeId);
    if (!emp) {
      throw new PrerequisiteException(
        "OFFERED → FULFILLED",
        `Employee with ID '${params.employeeId}' must exist`,
        "requisition_item",
        params.itemId,
      );
    }

    const dup = await db
      .select()
      .from(requisitionItems)
      .where(
        and(
          eq(requisitionItems.assignedEmpId, params.employeeId),
          eq(requisitionItems.itemStatus, IS.FULFILLED),
          ne(requisitionItems.itemId, params.itemId),
        ),
      )
      .limit(1);
    if (dup.length) {
      throw new ValidationException(
        "employee_id",
        `Employee '${params.employeeId}' is already assigned to another fulfilled item`,
        params.employeeId,
      );
    }

    const oldStatus = item.itemStatus;
    await db
      .update(requisitionItems)
      .set({ itemStatus: target, assignedEmpId: params.employeeId })
      .where(eq(requisitionItems.itemId, params.itemId));

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "FULFILL",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      metadata: { employee_id: params.employeeId },
    });

    await RequisitionWorkflowEngine.recalculateHeaderStatus(db, {
      reqId: item.reqId,
      changedBy: params.userId,
    });

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },

  async cancel(
    db: AppDb,
    params: {
      itemId: number;
      userId: number;
      userRoles: string[];
      reason: string;
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
    const item = await lockItem(db, params.itemId);
    await validateHeaderAllowsItemChange(db, item.reqId);
    await validateAssignedTa(db, item, params.userId, params.userRoles);

    const current = parseItemStatus(item.itemStatus);
    const target = IS.CANCELLED;
    validateItemTransition(current, target, params.userRoles, reason);

    const oldStatus = item.itemStatus;
    await db
      .update(requisitionItems)
      .set({ itemStatus: target })
      .where(eq(requisitionItems.itemId, params.itemId));

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "CANCEL",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      reason,
    });

    await RequisitionWorkflowEngine.recalculateHeaderStatus(db, {
      reqId: item.reqId,
      changedBy: params.userId,
    });

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },

  async reSource(
    db: AppDb,
    params: {
      itemId: number;
      userId: number;
      userRoles: string[];
      reason: string;
    },
  ) {
    const item = await lockItem(db, params.itemId);
    await validateHeaderAllowsItemChange(db, item.reqId);

    const current = parseItemStatus(item.itemStatus);
    const target = IS.SOURCING;
    validateItemTransition(current, target, params.userRoles, params.reason);

    const oldStatus = item.itemStatus;
    await db
      .update(requisitionItems)
      .set({ itemStatus: target })
      .where(eq(requisitionItems.itemId, params.itemId));

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "RE_SOURCE",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      reason: params.reason.trim(),
    });

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },

  async returnToShortlist(
    db: AppDb,
    params: {
      itemId: number;
      userId: number;
      userRoles: string[];
      reason: string;
    },
  ) {
    const item = await lockItem(db, params.itemId);
    await validateHeaderAllowsItemChange(db, item.reqId);

    const current = parseItemStatus(item.itemStatus);
    const target = IS.SHORTLISTED;
    validateItemTransition(current, target, params.userRoles, params.reason);

    const oldStatus = item.itemStatus;
    await db
      .update(requisitionItems)
      .set({ itemStatus: target })
      .where(eq(requisitionItems.itemId, params.itemId));

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "RETURN_TO_SHORTLIST",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      reason: params.reason.trim(),
    });

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },

  async offerDeclined(
    db: AppDb,
    params: {
      itemId: number;
      userId: number;
      userRoles: string[];
      reason: string;
    },
  ) {
    const item = await lockItem(db, params.itemId);
    await validateHeaderAllowsItemChange(db, item.reqId);

    const current = parseItemStatus(item.itemStatus);
    const target = IS.INTERVIEWING;
    validateItemTransition(current, target, params.userRoles, params.reason);

    const oldStatus = item.itemStatus;
    await db
      .update(requisitionItems)
      .set({ itemStatus: target })
      .where(eq(requisitionItems.itemId, params.itemId));

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "OFFER_DECLINED",
      prevStatus: oldStatus,
      newStatus: target,
      performedBy: params.userId,
      reason: params.reason.trim(),
    });

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },

  async swapTa(
    db: AppDb,
    params: {
      itemId: number;
      newTaId: number;
      userId: number;
      userRoles: string[];
      reason: string;
    },
  ) {
    if (!hasAnyNormalizedRole(params.userRoles, "HR", "Admin")) {
      throw new AuthorizationException(
        "swap TA on item",
        params.userRoles,
        ["HR", "Admin"],
      );
    }
    const reason = (params.reason ?? "").trim();
    if (reason.length < MIN_SWAP_REASON) {
      throw new ValidationException(
        "reason",
        "Swap reason must be at least 5 characters",
        reason,
      );
    }

    const item = await lockItem(db, params.itemId);
    const current = parseItemStatus(item.itemStatus);
    if (isItemTerminal(current)) {
      throw new TerminalStateException(current, "requisition_item", params.itemId);
    }

    const oldTaId = item.assignedTa;
    await db
      .update(requisitionItems)
      .set({ assignedTa: params.newTaId })
      .where(eq(requisitionItems.itemId, params.itemId));

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    const updated = rows[0]!;

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "SWAP_TA",
      prevStatus: updated.itemStatus,
      newStatus: updated.itemStatus,
      performedBy: params.userId,
      reason,
      metadata: { old_ta_id: oldTaId, new_ta_id: params.newTaId },
    });

    return updated;
  },

  async bulkReassign(
    db: AppDb,
    params: {
      reqId: number;
      oldTaId: number;
      newTaId: number;
      userId: number;
      userRoles: string[];
      reason: string;
      itemIds?: number[] | null;
    },
  ) {
    if (!hasAnyNormalizedRole(params.userRoles, "HR", "Admin")) {
      throw new AuthorizationException(
        "bulk reassign TA",
        params.userRoles,
        ["HR", "Admin"],
      );
    }
    const reason = (params.reason ?? "").trim();
    if (reason.length < MIN_BULK_REASON) {
      throw new ValidationException(
        "reason",
        "Reassignment reason must be at least 5 characters",
        reason,
      );
    }
    if (params.oldTaId === params.newTaId) {
      throw new ValidationException(
        "new_ta_id",
        "New TA must be different from the current TA",
        String(params.newTaId),
      );
    }

    const hdr = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.reqId, params.reqId))
      .limit(1);
    if (!hdr[0]) {
      throw new EntityNotFoundException("requisition", params.reqId);
    }

    const conds = [
      eq(requisitionItems.reqId, params.reqId),
      eq(requisitionItems.assignedTa, params.oldTaId),
      sql`${requisitionItems.itemStatus} NOT IN ('Fulfilled', 'Cancelled')`,
    ];

    const items =
      params.itemIds?.length ?
        await db
          .select()
          .from(requisitionItems)
          .where(
            and(...conds, inArray(requisitionItems.itemId, params.itemIds)),
          )
          .for("update")
      : await db
          .select()
          .from(requisitionItems)
          .where(and(...conds))
          .for("update");

    if (!items.length) {
      throw new ValidationException(
        "items",
        "No eligible items found for reassignment",
        `req_id=${params.reqId}, old_ta=${params.oldTaId}`,
      );
    }

    for (const item of items) {
      await db
        .update(requisitionItems)
        .set({ assignedTa: params.newTaId })
        .where(eq(requisitionItems.itemId, item.itemId));

      await logWorkflowTransition(db, {
        entityType: "requisition_item",
        entityId: item.itemId,
        action: "ITEM_REASSIGNED",
        prevStatus: item.itemStatus,
        newStatus: item.itemStatus,
        performedBy: params.userId,
        reason,
        metadata: {
          old_ta_id: params.oldTaId,
          new_ta_id: params.newTaId,
          req_id: params.reqId,
        },
      });
    }

    const out: (typeof requisitionItems.$inferSelect)[] = [];
    for (const item of items) {
      const r = await db
        .select()
        .from(requisitionItems)
        .where(eq(requisitionItems.itemId, item.itemId))
        .limit(1);
      if (r[0]) {
        out.push(r[0]);
      }
    }
    return out;
  },

  async editBudget(
    db: AppDb,
    params: {
      itemId: number;
      estimatedBudget: number;
      currency: string;
      userId: number;
      userRoles: string[];
    },
  ) {
    if (params.estimatedBudget <= 0) {
      throw new ValidationException(
        "estimated_budget",
        "Estimated budget must be greater than 0",
        params.estimatedBudget,
      );
    }
    if (!/^[A-Z]{2,10}$/.test(params.currency)) {
      throw new ValidationException(
        "currency",
        "Currency must be 2-10 uppercase letters (ISO 4217)",
        params.currency,
      );
    }

    const userSys = userRolesToSystemRoles(params.userRoles);
    let canEdit = false;
    for (const r of Array.from(ITEM_BUDGET_EDIT_AUTHORITY)) {
      if (userSys.has(r)) {
        canEdit = true;
        break;
      }
    }
    if (!canEdit) {
      throw new AuthorizationException(
        "edit item budget",
        params.userRoles,
        Array.from(ITEM_BUDGET_EDIT_AUTHORITY),
      );
    }

    const item = await lockItem(db, params.itemId);
    const hdrRows = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.reqId, item.reqId))
      .for("update")
      .limit(1);
    const reqRow = hdrRows[0];
    if (!reqRow) {
      throw new EntityNotFoundException("requisition", item.reqId);
    }

    const headerStatus = RequisitionWorkflowEngine.parseHeaderStatus(
      reqRow.overallStatus,
    );
    if (!ITEM_BUDGET_EDITABLE_HEADER_STATES.has(headerStatus)) {
      throw new EntityLockedException(
        "requisition_item",
        params.itemId,
        `Cannot edit budget when requisition is in '${reqRow.overallStatus}' status. Budget editing only allowed in: Draft, Pending_Budget`,
      );
    }

    const roleLower = new Set(params.userRoles.map((r) => r.toLowerCase()));
    if (
      reqRow.overallStatus === RS.PENDING_BUDGET &&
      (roleLower.has("hr") || roleLower.has("admin"))
    ) {
      throw new EntityLockedException(
        "requisition_item",
        params.itemId,
        "Estimated budget cannot be edited by HR/Admin in Pending_Budget. Set approved_budget via approve-budget endpoint.",
      );
    }

    if (item.approvedBudget != null && item.approvedBudget !== "") {
      throw new EntityLockedException(
        "requisition_item",
        params.itemId,
        "Cannot edit budget after it has been approved. Request a budget revision instead.",
      );
    }

    const oldEst = Number(item.estimatedBudget ?? 0);
    const oldCur = item.currency;
    const preserved = item.approvedBudget;
    const ver = incItemVersion(item.version);

    await db
      .update(requisitionItems)
      .set({
        estimatedBudget: String(params.estimatedBudget),
        currency: params.currency,
        approvedBudget: preserved,
        version: ver,
      })
      .where(eq(requisitionItems.itemId, params.itemId));

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "ITEM_BUDGET_EDITED",
      prevStatus: item.itemStatus,
      newStatus: item.itemStatus,
      performedBy: params.userId,
      userRoles: params.userRoles,
      metadata: {
        previous_estimated_budget: oldEst,
        new_estimated_budget: params.estimatedBudget,
        previous_currency: oldCur,
        new_currency: params.currency,
      },
    });

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },

  async approveBudget(
    db: AppDb,
    params: {
      itemId: number;
      userId: number;
      userRoles: string[];
      approvedBudget?: number | null;
    },
  ) {
    const userSys = userRolesToSystemRoles(params.userRoles);
    let can = false;
    for (const r of Array.from(ITEM_BUDGET_APPROVE_AUTHORITY)) {
      if (userSys.has(r)) {
        can = true;
        break;
      }
    }
    if (!can) {
      throw new AuthorizationException(
        "approve item budget",
        params.userRoles,
        Array.from(ITEM_BUDGET_APPROVE_AUTHORITY),
      );
    }

    const item = await lockItem(db, params.itemId);
    const hdrRows = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.reqId, item.reqId))
      .for("update")
      .limit(1);
    const reqRow = hdrRows[0];
    if (!reqRow) {
      throw new EntityNotFoundException("requisition", item.reqId);
    }

    const headerStatus = RequisitionWorkflowEngine.parseHeaderStatus(
      reqRow.overallStatus,
    );
    if (!ITEM_BUDGET_APPROVABLE_HEADER_STATES.has(headerStatus)) {
      throw new EntityLockedException(
        "requisition_item",
        params.itemId,
        `Cannot approve budget when requisition is in '${reqRow.overallStatus}' status. Budget approval only allowed in: Pending_Budget`,
      );
    }

    const est = Number(item.estimatedBudget ?? 0);
    if (!item.estimatedBudget || est <= 0) {
      throw new ValidationException(
        "estimated_budget",
        "Cannot approve budget: estimated_budget must be greater than 0",
        est,
      );
    }
    if (item.approvedBudget != null && item.approvedBudget !== "") {
      throw new ValidationException(
        "approved_budget",
        "Budget has already been approved for this item",
        Number(item.approvedBudget),
      );
    }

    let approvedValue: number;
    if (params.approvedBudget != null) {
      if (params.approvedBudget <= 0) {
        throw new ValidationException(
          "approved_budget",
          "Approved budget must be greater than 0",
          params.approvedBudget,
        );
      }
      approvedValue = params.approvedBudget;
    } else {
      approvedValue = est;
    }

    const ver = incItemVersion(item.version);
    await db
      .update(requisitionItems)
      .set({
        approvedBudget: String(approvedValue),
        version: ver,
      })
      .where(eq(requisitionItems.itemId, params.itemId));

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "ITEM_BUDGET_APPROVED",
      prevStatus: item.itemStatus,
      newStatus: item.itemStatus,
      performedBy: params.userId,
      userRoles: params.userRoles,
      metadata: {
        estimated_budget: est,
        approved_budget: approvedValue,
        currency: item.currency,
      },
    });

    const hdrFresh = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.reqId, item.reqId))
      .for("update")
      .limit(1);
    if (hdrFresh[0]) {
      await recalculateHeaderBudgetStatus(
        db,
        hdrFresh[0],
        params.userId,
        params.userRoles,
      );
    }

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },

  async rejectBudget(
    db: AppDb,
    params: {
      itemId: number;
      userId: number;
      userRoles: string[];
      reason: string;
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

    const userSys = userRolesToSystemRoles(params.userRoles);
    let can = false;
    for (const r of Array.from(ITEM_BUDGET_REJECT_AUTHORITY)) {
      if (userSys.has(r)) {
        can = true;
        break;
      }
    }
    if (!can) {
      throw new AuthorizationException(
        "reject item budget",
        params.userRoles,
        Array.from(ITEM_BUDGET_REJECT_AUTHORITY),
      );
    }

    const item = await lockItem(db, params.itemId);
    const hdrRows = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.reqId, item.reqId))
      .for("update")
      .limit(1);
    const reqRow = hdrRows[0];
    if (!reqRow) {
      throw new EntityNotFoundException("requisition", item.reqId);
    }

    const headerStatus = RequisitionWorkflowEngine.parseHeaderStatus(
      reqRow.overallStatus,
    );
    if (!ITEM_BUDGET_APPROVABLE_HEADER_STATES.has(headerStatus)) {
      throw new EntityLockedException(
        "requisition_item",
        params.itemId,
        `Cannot reject budget when requisition is in '${reqRow.overallStatus}' status.`,
      );
    }

    const oldEst = Number(item.estimatedBudget ?? 0);
    const oldAppr =
      item.approvedBudget != null && item.approvedBudget !== "" ?
        Number(item.approvedBudget)
      : null;
    const ver = incItemVersion(item.version);

    await db
      .update(requisitionItems)
      .set({ approvedBudget: null, version: ver })
      .where(eq(requisitionItems.itemId, params.itemId));

    await logWorkflowTransition(db, {
      entityType: "requisition_item",
      entityId: params.itemId,
      action: "ITEM_BUDGET_REJECTED",
      prevStatus: item.itemStatus,
      newStatus: item.itemStatus,
      performedBy: params.userId,
      userRoles: params.userRoles,
      reason,
      metadata: {
        estimated_budget: oldEst,
        previous_approved_budget: oldAppr,
        currency: item.currency,
      },
    });

    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, params.itemId))
      .limit(1);
    return rows[0]!;
  },
};
