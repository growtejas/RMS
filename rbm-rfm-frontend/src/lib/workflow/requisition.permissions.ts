// src/lib/workflow/requisition.permissions.ts

export type RequisitionStatus =
  | "Draft"
  | "Pending Budget Approval"
  | "Budget Approved"
  | "Budget Rejected"
  | "Pending HR Approval"
  | "HR Approved"
  | "HR Rejected"
  | "Released to TA"
  | "Active"
  | "On Hold"
  | "Closed";

export const canEditRequisition = (status: RequisitionStatus): boolean => {
  // Manager can edit only in these states
  const editableStatuses: RequisitionStatus[] = [
    "Draft",
    "Pending Budget Approval",
    "Budget Rejected", // Can resubmit after budget rejection
    "Pending HR Approval", // Before HR action
  ];

  return editableStatuses.includes(status);
};

export const canSubmitRequisition = (status: RequisitionStatus): boolean => {
  return status === "Draft" || status === "Budget Rejected";
};

export const canCancelRequisition = (status: RequisitionStatus): boolean => {
  return status !== "Closed" && status !== "Active";
};

export const getNextAllowedStatuses = (
  currentStatus: RequisitionStatus,
  userRole: "manager" | "finance" | "hr",
): RequisitionStatus[] => {
  const workflow: Record<RequisitionStatus, RequisitionStatus[]> = {
    Draft: ["Pending Budget Approval"],
    "Pending Budget Approval": ["Budget Approved", "Budget Rejected"],
    "Budget Approved": ["Pending HR Approval"],
    "Budget Rejected": ["Draft"],
    "Pending HR Approval": ["HR Approved", "HR Rejected"],
    "HR Approved": ["Released to TA"],
    "HR Rejected": ["Draft"],
    "Released to TA": ["Active", "On Hold"],
    Active: ["Closed", "On Hold"],
    "On Hold": ["Active", "Closed"],
    Closed: [],
  };

  return workflow[currentStatus] || [];
};
