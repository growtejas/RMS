/**
 * ============================================================================
 * REQUISITION PERMISSIONS - Spec-Compliant Status Definitions
 * ============================================================================
 *
 * F-002/F-003 FIX: Aligned with backend workflow_matrix.py
 *
 * Backend source: services/requisition/workflow_matrix.py
 * DB migration: alembic/versions/wf_spec_v1_constraints.py
 *
 * IMPORTANT: Use the requisition.workflow.ts workflow engine for
 * transition validation. These functions are deprecated helpers.
 */

// Import from canonical source
import {
  RequisitionStatus,
  REQUISITION_STATUSES,
  canTransitionRequisition,
} from "./requisition.workflow";

// Re-export for compatibility
export type { RequisitionStatus };
export { REQUISITION_STATUSES };

/**
 * TERMINAL STATES - no outbound transitions allowed
 * Source: workflow_matrix.py HEADER_TERMINAL_STATES
 *
 * F-004: REJECTED removed from terminal states - can now reopen to Draft
 */
export const TERMINAL_STATUSES: readonly RequisitionStatus[] = [
  "Fulfilled",
  "Cancelled",
] as const;

/**
 * States where requisition can be edited by Manager
 * Source: workflow_matrix.py + permissions logic
 */
export const EDITABLE_STATUSES: readonly RequisitionStatus[] = [
  "Draft",
] as const;

export const canEditRequisition = (status: RequisitionStatus): boolean => {
  return EDITABLE_STATUSES.includes(
    status as (typeof EDITABLE_STATUSES)[number],
  );
};

export const canSubmitRequisition = (status: RequisitionStatus): boolean => {
  // Can only submit from Draft
  return status === "Draft";
};

export const canCancelRequisition = (status: RequisitionStatus): boolean => {
  // Can cancel from non-terminal states
  return !TERMINAL_STATUSES.includes(
    status as (typeof TERMINAL_STATUSES)[number],
  );
};

/**
 * Get allowed target statuses for a given current status.
 *
 * PREFERRED: Use requisitionWorkflow.getAvailableTransitions() instead
 * for full guard validation.
 */
export const getNextAllowedStatuses = (
  currentStatus: RequisitionStatus,
  _userRole?: "manager" | "finance" | "hr", // Deprecated - use workflow guards
): RequisitionStatus[] => {
  // Use the workflow engine for accurate transitions
  return REQUISITION_STATUSES.filter(
    (target) =>
      target !== currentStatus &&
      canTransitionRequisition(currentStatus, target),
  );
};

/**
 * Check if a status is terminal (no further transitions possible)
 */
export const isTerminalStatus = (status: RequisitionStatus): boolean => {
  return TERMINAL_STATUSES.includes(
    status as (typeof TERMINAL_STATUSES)[number],
  );
};

/**
 * Check if transition is allowed structurally
 * (Does not check guards - use workflow engine for full validation)
 */
export const isTransitionAllowed = canTransitionRequisition;
