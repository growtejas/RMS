/**
 * Mirrors `backend/services/requisition/permissions.py` for non-workflow writes.
 */

export const EDITABLE_STATUSES = new Set<string>([
  "Draft",
  "Pending_Budget",
  "Pending_HR",
  "Pending Budget Approval",
  "Pending HR Approval",
]);

export const JD_EDITABLE_STATUSES = new Set<string>([
  "Draft",
  "Pending_Budget",
  "Pending_HR",
  "Pending Budget Approval",
  "Pending HR Approval",
  "Budget Rejected",
]);

/** Block adding items (matches `ITEM_MODIFICATION_BLOCKED_HEADER_STATES` enum values). */
export const ITEM_CREATE_BLOCKED_STATUSES = new Set<string>([
  "Pending_Budget",
  "Pending_HR",
  "Fulfilled",
  "Rejected",
  "Cancelled",
]);

export function isOwner(raisedBy: number, userId: number): boolean {
  return raisedBy === userId;
}

export function canManagerEditRequisition(
  overallStatus: string,
  raisedBy: number,
  userId: number,
): boolean {
  return isOwner(raisedBy, userId) && EDITABLE_STATUSES.has(overallStatus);
}

export function canEditJd(
  overallStatus: string,
  raisedBy: number,
  userId: number,
): boolean {
  return isOwner(raisedBy, userId) && JD_EDITABLE_STATUSES.has(overallStatus);
}

/** FastAPI: RequisitionStatus(overall_status) must succeed, then not in blocked set. */
export function canCreateItem(overallStatus: string): {
  ok: boolean;
  reason?: string;
} {
  const canonical = new Set([
    "Draft",
    "Pending_Budget",
    "Pending_HR",
    "Active",
    "Fulfilled",
    "Rejected",
    "Cancelled",
  ]);
  if (!canonical.has(overallStatus)) {
    return { ok: false, reason: `Invalid requisition status: ${overallStatus}` };
  }
  if (ITEM_CREATE_BLOCKED_STATUSES.has(overallStatus)) {
    return {
      ok: false,
      reason: `Cannot add items when requisition is in '${overallStatus}' status`,
    };
  }
  return { ok: true };
}
