/**
 * RMS uses role names + resource checks (e.g. panelist membership), not a permissions table.
 * Interviewer capabilities for documentation and future expansion:
 * - interviews:view_assigned → Interviewer role + user is in interview_panelists for that interview
 * - feedback:submit → Interviewer role + panelist row linked to user_id + interview not cancelled
 */
export const INTERVIEWER_ROLE = "Interviewer" as const;

export const INTERVIEWER_CAPABILITIES = {
  viewAssignedInterviews: "interviews:view_assigned",
  submitFeedback: "feedback:submit",
} as const;
