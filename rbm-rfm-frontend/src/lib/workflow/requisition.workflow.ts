/**
 * ============================================================================
 * REQUISITION WORKFLOW - State Machine Definition
 * ============================================================================
 *
 * Defines all valid status transitions for the requisition lifecycle.
 * This is the single source of truth for requisition state management.
 */

import {
  Workflow,
  TransitionContext,
  minLength,
  required,
  when,
} from "./engine";

// ============================================================================
// Status Types
// ============================================================================

export const REQUISITION_STATUSES = [
  "Draft",
  "Pending Budget Approval",
  "Pending HR Approval",
  "Approved & Unassigned",
  "Active",
  "Closed",
  "Rejected",
  "Cancelled",
] as const;

export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

// ============================================================================
// Context Type
// ============================================================================

/**
 * Context required for requisition transitions.
 * Components must provide relevant data for validation.
 */
export interface RequisitionContext extends TransitionContext {
  /** Reason for rejection - required when rejecting */
  rejectionReason?: string;
  /** User's role for permission checks */
  userRole?: "hr" | "budget_manager" | "admin" | "requester";
  /** Whether budget has been allocated */
  hasBudget?: boolean;
  /** Whether positions are assigned */
  hasAssignments?: boolean;
  /** Reason for cancellation */
  cancellationReason?: string;
  /** The requisition ID for logging */
  requisitionId?: number;
}

// ============================================================================
// Transition Guards
// ============================================================================

const hasRejectionReason = minLength<RequisitionContext>(
  "rejectionReason",
  10,
  "Rejection reason must be at least 10 characters",
);

const hasCancellationReason = minLength<RequisitionContext>(
  "cancellationReason",
  10,
  "Cancellation reason must be at least 10 characters",
);

const isBudgetManager = when<RequisitionContext>(
  (ctx) => ctx.userRole === "budget_manager" || ctx.userRole === "admin",
  "Only budget managers can approve budget",
);

const isHRUser = when<RequisitionContext>(
  (ctx) => ctx.userRole === "hr" || ctx.userRole === "admin",
  "Only HR users can perform this action",
);

const isRequesterOrAdmin = when<RequisitionContext>(
  (ctx) => ctx.userRole === "requester" || ctx.userRole === "admin",
  "Only the requester can perform this action",
);

const hasBudgetAllocated = when<RequisitionContext>(
  (ctx) => ctx.hasBudget === true,
  "Budget must be allocated before proceeding",
);

const hasPositionsAssigned = when<RequisitionContext>(
  (ctx) => ctx.hasAssignments === true,
  "At least one position must be assigned",
);

// ============================================================================
// Workflow Definition
// ============================================================================

export const requisitionWorkflow = new Workflow<
  RequisitionStatus,
  RequisitionContext
>(
  {
    name: "Requisition",
    version: "1.0.0",
    description: "Resource requisition approval and fulfillment workflow",
  },
  {
    // Draft state - initial state
    Draft: {
      "Pending Budget Approval": {
        description: "Submit requisition for budget approval",
        guards: [isRequesterOrAdmin],
      },
      Cancelled: {
        description: "Cancel draft requisition",
        guards: [isRequesterOrAdmin],
      },
    },

    // Pending Budget Approval - waiting for finance
    "Pending Budget Approval": {
      "Pending HR Approval": {
        description: "Approve budget and send to HR",
        guards: [isBudgetManager],
      },
      Rejected: {
        description: "Reject due to budget constraints",
        guards: [isBudgetManager, hasRejectionReason],
      },
      Draft: {
        description: "Return to requester for edits",
        guards: [isBudgetManager],
      },
    },

    // Pending HR Approval - waiting for HR review
    "Pending HR Approval": {
      "Approved & Unassigned": {
        description: "Approve requisition for hiring",
        guards: [isHRUser],
      },
      Rejected: {
        description: "Reject due to HR policy",
        guards: [isHRUser, hasRejectionReason],
      },
      "Pending Budget Approval": {
        description: "Return to budget review",
        guards: [isHRUser],
      },
    },

    // Approved & Unassigned - ready for assignment
    "Approved & Unassigned": {
      Active: {
        description: "Activate when assignments begin",
        guards: [isHRUser, hasPositionsAssigned],
      },
      Cancelled: {
        description: "Cancel approved requisition",
        guards: [isHRUser, hasCancellationReason],
      },
    },

    // Active - hiring in progress
    Active: {
      Closed: {
        description: "Close when all positions filled",
        guards: [isHRUser],
      },
      Cancelled: {
        description: "Cancel active requisition",
        guards: [isHRUser, hasCancellationReason],
      },
    },

    // Terminal states - no outgoing transitions
    Closed: {},
    Rejected: {},
    Cancelled: {},
  },
);

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick check if a status transition is structurally possible.
 */
export function canTransitionRequisition(
  current: RequisitionStatus,
  next: RequisitionStatus,
): boolean {
  return requisitionWorkflow.canTransition(current, next);
}

/**
 * Full validation of a requisition status change.
 */
export function validateRequisitionTransition(
  current: RequisitionStatus,
  next: RequisitionStatus,
  context: RequisitionContext = {},
) {
  return requisitionWorkflow.validate(current, next, context);
}

/**
 * Get all possible next statuses from current state.
 */
export function getRequisitionNextStatuses(
  current: RequisitionStatus,
): RequisitionStatus[] {
  return requisitionWorkflow.getAvailableTransitions(current);
}

/**
 * Check if a status is a terminal state (no outgoing transitions).
 */
export function isTerminalRequisitionStatus(
  status: RequisitionStatus,
): boolean {
  return requisitionWorkflow.getAvailableTransitions(status).length === 0;
}

/**
 * Human-readable status labels for UI display.
 */
export const REQUISITION_STATUS_LABELS: Record<RequisitionStatus, string> = {
  Draft: "Draft",
  "Pending Budget Approval": "Pending Budget Approval",
  "Pending HR Approval": "Pending HR Approval",
  "Approved & Unassigned": "Approved & Unassigned",
  Active: "Active",
  Closed: "Closed",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
};

/**
 * CSS class names for status badges.
 */
export const REQUISITION_STATUS_CLASSES: Record<RequisitionStatus, string> = {
  Draft: "status-draft",
  "Pending Budget Approval": "status-pending-budget",
  "Pending HR Approval": "status-pending-hr",
  "Approved & Unassigned": "status-approved",
  Active: "status-active",
  Closed: "status-closed",
  Rejected: "status-rejected",
  Cancelled: "status-cancelled",
};
