/**
 * ============================================================================
 * WORKFLOW TYPES — Single Source of Truth
 * ============================================================================
 *
 * Canonical type definitions for the workflow engine.
 * MUST match backend/services/requisition/workflow_matrix.py exactly.
 *
 * RULE: All other files import status types from HERE.
 *       No duplicate enum definitions allowed elsewhere.
 */

// ============================================================================
// REQUISITION STATUS
// ============================================================================

/**
 * Requisition header statuses.
 * Source: backend WorkflowMatrix.REQUISITION_TRANSITIONS
 */
export type RequisitionStatus =
  | "Draft"
  | "Pending_Budget"
  | "Pending_HR"
  | "Active"
  | "Fulfilled"
  | "Rejected"
  | "Cancelled";

/** All valid requisition statuses as an array (for runtime checks). */
export const REQUISITION_STATUSES: readonly RequisitionStatus[] = [
  "Draft",
  "Pending_Budget",
  "Pending_HR",
  "Active",
  "Fulfilled",
  "Rejected",
  "Cancelled",
] as const;

/** Terminal statuses where no further transitions are possible. */
export const TERMINAL_REQUISITION_STATUSES: readonly RequisitionStatus[] = [
  "Fulfilled",
  "Rejected",
  "Cancelled",
] as const;

// ============================================================================
// REQUISITION ITEM STATUS
// ============================================================================

/**
 * Requisition item statuses.
 * Source: backend WorkflowMatrix.ITEM_TRANSITIONS
 */
export type RequisitionItemStatus =
  | "Pending"
  | "Sourcing"
  | "Shortlisted"
  | "Interviewing"
  | "Offered"
  | "Fulfilled"
  | "Cancelled";

/** All valid item statuses as an array. */
export const ITEM_STATUSES: readonly RequisitionItemStatus[] = [
  "Pending",
  "Sourcing",
  "Shortlisted",
  "Interviewing",
  "Offered",
  "Fulfilled",
  "Cancelled",
] as const;

// ============================================================================
// TRANSITION ACTION (for audit trail context)
// ============================================================================

/**
 * Known workflow transition actions.
 * Kept as a union for type-safety; the backend may send additional values.
 */
export type TransitionAction =
  | "submit"
  | "approve_budget"
  | "approve_hr"
  | "reject"
  | "cancel"
  | "reopen"
  | "assign_ta"
  | "start_sourcing"
  | "shortlist"
  | "start_interview"
  | "make_offer"
  | "fulfill"
  | "cancel_item";

// ============================================================================
// DISPLAY LABELS
// ============================================================================

/** Human-readable labels for requisition statuses. */
export const REQUISITION_STATUS_LABELS: Record<RequisitionStatus, string> = {
  Draft: "Draft",
  Pending_Budget: "Pending Budget",
  Pending_HR: "Pending HR",
  Active: "Active",
  Fulfilled: "Fulfilled",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
};

/** Human-readable labels for item statuses. */
export const ITEM_STATUS_LABELS: Record<RequisitionItemStatus, string> = {
  Pending: "Pending",
  Sourcing: "Sourcing",
  Shortlisted: "Shortlisted",
  Interviewing: "Interviewing",
  Offered: "Offer Extended",
  Fulfilled: "Fulfilled",
  Cancelled: "Cancelled",
};

// ============================================================================
// CSS CLASS MAPPINGS
// ============================================================================

/** CSS class per requisition status — used by StatusBadge. */
export const REQUISITION_STATUS_CLASSES: Record<RequisitionStatus, string> = {
  Draft: "status--draft",
  Pending_Budget: "status--pending",
  Pending_HR: "status--pending",
  Active: "status--active",
  Fulfilled: "status--fulfilled",
  Rejected: "status--rejected",
  Cancelled: "status--cancelled",
};

/** CSS class per item status. */
export const ITEM_STATUS_CLASSES: Record<RequisitionItemStatus, string> = {
  Pending: "status--pending",
  Sourcing: "status--sourcing",
  Shortlisted: "status--shortlisted",
  Interviewing: "status--interviewing",
  Offered: "status--offered",
  Fulfilled: "status--fulfilled",
  Cancelled: "status--cancelled",
};

// ============================================================================
// LEGACY NORMALIZATION
// ============================================================================

/**
 * Maps legacy/display status values to spec-compliant values.
 * Used to handle data from older database records.
 */
export const LEGACY_STATUS_MAP: Record<string, RequisitionStatus> = {
  "Pending Budget Approval": "Pending_Budget",
  "Pending HR Approval": "Pending_HR",
  "Approved & Unassigned": "Active",
  "In Progress": "Active",
  "In-Progress": "Active",
  Closed: "Fulfilled",
  "Closed (Partially Fulfilled)": "Fulfilled",
};

/**
 * Normalize any status string to a spec-compliant RequisitionStatus.
 * Handles both current and legacy values.
 */
export function normalizeStatus(status: string): RequisitionStatus {
  if (REQUISITION_STATUSES.includes(status as RequisitionStatus)) {
    return status as RequisitionStatus;
  }

  const mapped = LEGACY_STATUS_MAP[status];
  if (mapped) {
    return mapped;
  }

  // Fallback for truly unknown values — don't crash, surface in UI
  return status as RequisitionStatus;
}

/**
 * Get display label for a requisition status (handles legacy values).
 */
export function getStatusLabel(status: string): string {
  const normalized = normalizeStatus(status);
  return REQUISITION_STATUS_LABELS[normalized] ?? status;
}

/**
 * Get CSS class for a requisition status (handles legacy values).
 */
export function getStatusClass(status: string): string {
  const normalized = normalizeStatus(status);
  return REQUISITION_STATUS_CLASSES[normalized] ?? "status--unknown";
}

/**
 * Get display label for an item status.
 */
export function getItemStatusLabel(status: string): string {
  return ITEM_STATUS_LABELS[status as RequisitionItemStatus] ?? status;
}

/**
 * Get CSS class for an item status.
 */
export function getItemStatusClass(status: string): string {
  return (
    ITEM_STATUS_CLASSES[status as RequisitionItemStatus] ?? "status--unknown"
  );
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isRequisitionStatus(value: string): value is RequisitionStatus {
  return REQUISITION_STATUSES.includes(value as RequisitionStatus);
}

export function isItemStatus(value: string): value is RequisitionItemStatus {
  return ITEM_STATUSES.includes(value as RequisitionItemStatus);
}

export function isTerminalStatus(status: RequisitionStatus): boolean {
  return TERMINAL_REQUISITION_STATUSES.includes(status);
}
