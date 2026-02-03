/**
 * ============================================================================
 * WORKFLOW MODULE - Public Exports
 * ============================================================================
 *
 * Central export point for all workflow-related functionality.
 * Import from 'lib/workflow' in components.
 */

// Core engine
export {
  Workflow,
  WorkflowError,
  // Guard factories
  minLength,
  required,
  hasDate,
  when,
  minValue,
  allOf,
  anyOf,
  // Types
  type TransitionResult,
  type TransitionContext,
  type TransitionGuard,
  type TransitionEdge,
  type WorkflowDefinition,
  type WorkflowMeta,
} from "./engine";

// Requisition workflow
export {
  requisitionWorkflow,
  canTransitionRequisition,
  validateRequisitionTransition,
  getRequisitionNextStatuses,
  isTerminalRequisitionStatus,
  REQUISITION_STATUSES,
  REQUISITION_STATUS_LABELS,
  REQUISITION_STATUS_CLASSES,
  type RequisitionStatus,
  type RequisitionContext,
} from "./requisition.workflow";

// Employee lifecycle workflow
export {
  employeeLifecycleWorkflow,
  canTransitionEmployee,
  validateEmployeeTransition,
  getEmployeeNextStatuses,
  isTerminalEmployeeStatus,
  EMPLOYEE_LIFECYCLE_STATUSES,
  ONBOARDING_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUS_CLASSES,
  type EmployeeLifecycleStatus,
  type OnboardingStatus,
  type EmployeeLifecycleContext,
} from "./employee.workflow";

// TA Ticket workflow
export {
  taTicketWorkflow,
  canTransitionTATicket,
  validateTATicketTransition,
  getTATicketNextStatuses,
  isTerminalTAStatus,
  TA_TICKET_STATUSES,
  TA_TICKET_STATUS_LABELS,
  TA_TICKET_STATUS_CLASSES,
  type TATicketStatus,
  type TATicketContext,
} from "./ta-ticket.workflow";

// Budget workflow
export {
  budgetWorkflow,
  canTransitionBudget,
  validateBudgetTransition,
  getBudgetNextStatuses,
  isTerminalBudgetStatus,
  canEditBudget,
  isBudgetLocked,
  BUDGET_STATUSES,
  BUDGET_STATUS_LABELS,
  BUDGET_STATUS_CLASSES,
  type BudgetStatus,
  type BudgetContext,
} from "./budget.workflow";

// React hooks
export {
  useWorkflowTransition,
  useWorkflowActions,
  useWorkflowValidation,
  type WorkflowTransitionState,
  type WorkflowTransitionActions,
  type WorkflowAction,
  type WorkflowActionConfig,
} from "./hooks";
