/**
 * Phase E — must-preserve invariants per transition (checklist).
 * Source of truth for behavior: `workflow_engine_v2.py` + `workflow_matrix.py`.
 */

export const WORKFLOW_INVARIANTS = {
  /** POST .../workflow/submit */
  SUBMIT: [
    "Matrix: Draft → Pending_Budget only; terminal headers rejected first.",
    "Roles: Manager (or Admin via Owner→Admin mapping); not system-only.",
    "Optimistic lock: expected_version must match requisitions.version when provided.",
    "Pessimistic lock: SELECT requisitions FOR UPDATE before transition.",
    "Audit: workflow_transition_audit row + requisition_status_history row; version incremented.",
  ],
  /** POST .../workflow/approve-budget */
  APPROVE_BUDGET_HEADER: [
    "Matrix: Pending_Budget → Pending_HR; roles Manager/Admin/HR.",
    "Sets budget_approved_by; increments header version; audit + status_history.",
  ],
  /** POST .../workflow/approve-hr */
  APPROVE_HR: [
    "Matrix: Pending_HR → Active; roles HR/Admin only.",
    "Sets approved_by and approval_history timestamp; audit + status_history.",
  ],
  /** POST .../workflow/reject */
  REJECT_HEADER: [
    "Targets Rejected from Pending_Budget or Pending_HR; roles vary by matrix row.",
    "reason min length 10; stores rejection_reason; audit justification = reason.",
  ],
  /** POST .../workflow/cancel */
  CANCEL_HEADER: [
    "reason min length 10.",
    "All non-terminal items set to Cancelled (locked FOR UPDATE) before header → Cancelled.",
    "Audit metadata.cancelled_items = count of items cancelled.",
  ],
  /** POST .../workflow/reopen */
  REOPEN: [
    "Matrix: Rejected → Draft; Manager/Admin.",
    "Clears budget_approved_by and approved_by; optional reason in transition audit.",
  ],
  /** POST .../requisition-items/.../workflow/assign-ta */
  ASSIGN_TA_ITEM: [
    "Header must be Active (item status changes blocked otherwise).",
    "TA self-assign only unless HR/Admin; assigned_ta must be null before assign.",
    "GC-003: Pending → Sourcing is system-only in matrix; engine performs auto-transition after assign.",
    "Recalculate header status after assign (Active header may auto-complete).",
  ],
  /** POST .../workflow/fulfill */
  FULFILL: [
    "Matrix: Offered → Fulfilled; roles HR/TA only (not Admin) per ITEM_TRANSITION_AUTHORITY.",
    "Employee must exist; no duplicate fulfilled assignment to same emp on another item.",
    "Recalculate header (may auto Fulfilled/Cancelled when all items terminal).",
  ],
  /** POST .../requisitions/{id}/bulk-reassign */
  BULK_REASSIGN: [
    "HR/Admin only; reason ≥5; old_ta_id ≠ new_ta_id.",
    "Eligible rows: same req_id, assigned_ta = old, status ∉ {Fulfilled, Cancelled}; optional item_ids filter.",
    "All matching rows locked FOR UPDATE; per-item ITEM_REASSIGNED audit; atomic transaction.",
  ],
  /** Item budget approve */
  ITEM_BUDGET_APPROVE: [
    "Header must be Pending_Budget; estimated_budget > 0; approved_budget was null.",
    "When all items have approved_budget > 0, header → Pending_HR with ALL_BUDGETS_APPROVED audit + status_history.",
  ],
} as const;

/** Phase F — observability (`backend/api/workflow_audit.py`). */
export const WORKFLOW_OBSERVABILITY_INVARIANTS = [
  "GET /api/workflow/audit/{req_id}: header + optional item rows; performer username via users join.",
  "GET /api/workflow/metrics: audit table = successes; in-process collector = failures (workflowCatch); merged response.",
  "GET /api/workflow/health: FastAPI-style thresholds; last_transition from latest audit created_at.",
  "GET /api/workflow/stats/transitions: SQL aggregates on workflow_transition_audit only.",
] as const;
