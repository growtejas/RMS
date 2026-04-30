/** Shared HR requisitions payload shape returned by `/requisitions`. */

export interface BackendRequisitionItem {
  item_id: number;
  req_id: number;
  role_position: string;
  skill_level?: string | null;
  experience_years?: number | null;
  education_requirement?: string | null;
  job_description: string;
  requirements?: string | null;
  item_status: string;
  assigned_ta?: number | null;
}

export interface BackendRequisition {
  req_id: number;
  project_name?: string | null;
  client_name?: string | null;
  office_location?: string | null;
  work_mode?: string | null;
  overall_status: string;
  required_by_date?: string | null;
  priority?: string | null;
  created_at?: string | null;
  raised_by?: number | null;
  assigned_ta?: number | null;
  assigned_at?: string | null;
  budget_amount?: number | null;
  budget_approved_by?: number | null;
  approved_by?: number | null;
  approval_history?: string | null;
  rejection_reason?: string | null;
  total_estimated_budget?: number | null;
  total_approved_budget?: number | null;
  items: BackendRequisitionItem[];
}
