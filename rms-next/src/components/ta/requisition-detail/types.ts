import type { RequisitionItemStatus } from "@/types/workflow";

export type RequisitionDetailTabId =
  | "overview"
  | "items"
  | "ats"
  | "shortlisted"
  | "interviews"
  | "timeline";

export interface RequisitionDetailsProps {
  requisitionId?: string | null;
  onBack?: () => void;
  onUpdate?: (ticket: TicketData) => void;
}

export interface RequisitionItem {
  id: string;
  numericItemId: number;
  skill: string;
  level: string;
  experience: number;
  education: string;
  itemStatus: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  assignedDate?: string;
  description: string;
  cvFileUrl?: string;
  cvFileName?: string;
  assignedTAId?: number | null;
  requirements?: string;
  replacementHire?: boolean;
  replacedEmpId?: string | null;
  estimatedBudget?: number | null;
  approvedBudget?: number | null;
  currency?: string;
  jdFileKey?: string | null;
  pipelineRankingUseRequisitionJd?: boolean;
  pipelineJdText?: string | null;
  pipelineJdFileKey?: string | null;
  rankingRequiredSkills?: string[] | null;
}

export const ITEM_MILESTONE_ORDER: RequisitionItemStatus[] = [
  "Pending",
  "Sourcing",
  "Shortlisted",
  "Interviewing",
  "Offered",
  "Fulfilled",
];

export interface TimelineEvent {
  date: string;
  event: string;
  user: string;
}

export interface NoteEntry {
  date: string;
  user: string;
  text: string;
}

export interface TicketData {
  id: string;
  ticketId: string;
  projectName: string;
  projectCode: string;
  client: string;
  projectManager: string;
  requiredBy: string;
  workMode: string;
  location: string;
  priority: string;
  overallStatus: string;
  justification: string;
  dateCreated: string;
  assignedTA: string;
  assignedTAId?: number | null;
  raisedById?: number | null;
  approvedBy?: number | null;
  budgetApprovedBy?: number | null;
  approvalHistory?: string | null;
  assignedAt?: string | null;
  createdAt?: string | null;
  daysOpen: number;
  slaHours: number;
  budget: string;
  projectDuration: string;
  items: RequisitionItem[];
  timeline: TimelineEvent[];
  notes: NoteEntry[];
}

export interface BackendRequisitionItem {
  item_id: number;
  req_id: number;
  role_position: string;
  skill_level?: string | null;
  experience_years?: number | null;
  education_requirement?: string | null;
  job_description: string;
  jd_file_key?: string | null;
  cv_file_key?: string | null;
  cv_file_name?: string | null;
  requirements?: string | null;
  item_status: string;
  assigned_ta?: number | null;
  replacement_hire?: boolean;
  replaced_emp_id?: string | null;
  estimated_budget?: number | null;
  approved_budget?: number | null;
  currency?: string | null;
  pipeline_ranking_use_requisition_jd?: boolean;
  pipeline_jd_text?: string | null;
  pipeline_jd_file_key?: string | null;
  ranking_required_skills?: string[] | null;
}

export interface BackendRequisition {
  req_id: number;
  project_name?: string | null;
  client_name?: string | null;
  overall_status: string;
  required_by_date?: string | null;
  priority?: string | null;
  budget_amount?: number | null;
  created_at?: string | null;
  work_mode?: string | null;
  office_location?: string | null;
  justification?: string | null;
  duration?: string | null;
  raised_by?: number | null;
  assigned_ta?: number | null;
  budget_approved_by?: number | null;
  approved_by?: number | null;
  approval_history?: string | null;
  assigned_at?: string | null;
  jd_file_key?: string | null;
  items: BackendRequisitionItem[];
}

export interface StatusHistoryEntry {
  history_id: number;
  req_id: number;
  old_status?: string | null;
  new_status?: string | null;
  changed_by?: number | null;
  changed_at: string;
}

export interface AuditLogEntry {
  audit_id: number;
  entity_name: string;
  entity_id?: string | null;
  action: string;
  performed_by?: number | null;
  performed_by_username?: string | null;
  performed_by_full_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  performed_at: string;
}

export interface UserDirectoryEntry {
  user_id: number;
  username: string;
  roles?: string[];
}

export type ExperienceFitTone = "green" | "blue" | "red";

export type ExperienceFitFlag = {
  tone: ExperienceFitTone;
  label: string;
  candidateYears: number;
  requiredYears: number;
};
