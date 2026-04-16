/**
 * ============================================================================
 * CANDIDATE & INTERVIEW API
 * ============================================================================
 *
 * CRUD + pipeline operations for the Candidate Pipeline feature.
 * Replaces the old "Available Employees" placeholder.
 */

import { TA_OWNERSHIP_DENIED_MESSAGE } from "@/lib/auth/ownership-messages";

import { apiClient } from "./client";

export { TA_OWNERSHIP_DENIED_MESSAGE };

export function getCandidateActionErrorMessage(
  err: unknown,
  fallback: string,
): string {
  const ax = err as {
    response?: { status?: number; data?: { detail?: string } };
  };
  const detail = ax?.response?.data?.detail;
  if (ax?.response?.status === 403) {
    return typeof detail === "string" && detail.trim().length > 0
      ? detail
      : TA_OWNERSHIP_DENIED_MESSAGE;
  }
  return typeof detail === "string" ? detail : fallback;
}

// ============================================================================
// TYPES
// ============================================================================

export interface Interview {
  id: number;
  candidate_id: number;
  round_number: number;
  interviewer_name: string;
  scheduled_at: string;
  status: "Scheduled" | "Completed" | "Cancelled";
  result: "Pass" | "Fail" | "Hold" | null;
  feedback: string | null;
  conducted_by: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Candidate {
  candidate_id: number;
  application_id?: number;
  requisition_item_id: number;
  requisition_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  resume_path: string | null;
  current_stage:
    | "Sourced"
    | "Shortlisted"
    | "Interviewing"
    | "Offered"
    | "Hired"
    | "Rejected";
  added_by: number | null;
  source?: string | null;
  created_at: string | null;
  updated_at: string | null;
  stage_history?: ApplicationStageHistory[];
  interviews: Interview[];
}

export interface ApplicationStageHistory {
  history_id: number;
  application_id: number;
  candidate_id: number;
  from_stage: string | null;
  to_stage: Candidate["current_stage"];
  changed_by: number | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  changed_at: string | null;
}

export interface ApplicationRecord {
  application_id: number;
  candidate_id: number;
  requisition_item_id: number;
  requisition_id: number;
  current_stage: Candidate["current_stage"];
  source: string;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  candidate: {
    candidate_id: number;
    full_name: string;
    email: string;
    phone: string | null;
  };
  stage_history?: ApplicationStageHistory[];
}

export interface ApplicationsPipelineResponse {
  requisition_item_id: number | null;
  requisition_id: number | null;
  total: number;
  stages: Array<
    | { stage: string; count: number }
    | { stage: string; count: number; applications: ApplicationRecord[] }
  >;
}

export interface RequisitionItemRankingCandidate {
  candidate_id: number;
  requisition_item_id: number;
  full_name: string;
  email: string;
  current_stage: Candidate["current_stage"];
  score: {
    keyword_score: number;
    semantic_score: number;
    business_score: number;
    final_score: number;
  };
  explain: {
    reasons: string[];
    matched_terms: string[];
    missing_terms: string[];
  };
}

export interface RequisitionItemRankingResponse {
  requisition_item_id: number;
  req_id: number;
  ranking_version: string;
  weights: {
    keyword: number;
    semantic: number;
    business: number;
  };
  generated_at: string;
  total_candidates: number;
  ranked_candidates: RequisitionItemRankingCandidate[];
}

export interface CandidateCreate {
  requisition_item_id: number;
  requisition_id: number;
  full_name: string;
  email: string;
  phone?: string;
  resume_path?: string;
}

export interface InterviewCreate {
  candidate_id: number;
  round_number: number;
  interviewer_name: string;
  scheduled_at: string; // ISO datetime
}

export interface InterviewUpdate {
  interviewer_name?: string;
  scheduled_at?: string;
  status?: "Scheduled" | "Completed" | "Cancelled";
  result?: "Pass" | "Fail" | "Hold";
  feedback?: string;
}

export interface CandidateStageUpdate {
  new_stage: Candidate["current_stage"];
  reason?: string;
}

// ============================================================================
// CANDIDATE ENDPOINTS
// ============================================================================

export async function fetchCandidates(
  requisitionId: number,
): Promise<Candidate[]> {
  const { data } = await apiClient.get<Candidate[]>("/candidates/", {
    params: { requisition_id: requisitionId },
  });
  return data;
}

export async function fetchCandidatesByItem(
  itemId: number,
): Promise<Candidate[]> {
  const { data } = await apiClient.get<Candidate[]>("/candidates/", {
    params: { requisition_item_id: itemId },
  });
  return data;
}

export async function getCandidate(candidateId: number): Promise<Candidate> {
  const { data } = await apiClient.get<Candidate>(`/candidates/${candidateId}`);
  return data;
}

export async function createCandidate(
  payload: CandidateCreate,
): Promise<Candidate> {
  const { data } = await apiClient.post<Candidate>("/candidates/", payload);
  return data;
}

export async function updateCandidate(
  candidateId: number,
  payload: Partial<
    Pick<CandidateCreate, "full_name" | "email" | "phone" | "resume_path">
  >,
): Promise<Candidate> {
  const { data } = await apiClient.patch<Candidate>(
    `/candidates/${candidateId}`,
    payload,
  );
  return data;
}

export async function updateCandidateStage(
  candidateId: number,
  payload: CandidateStageUpdate,
): Promise<Candidate> {
  const { data } = await apiClient.patch<Candidate>(
    `/candidates/${candidateId}/stage`,
    payload,
  );
  return data;
}

function mapApplicationToCandidate(app: ApplicationRecord): Candidate {
  return {
    candidate_id: app.candidate_id,
    application_id: app.application_id,
    requisition_item_id: app.requisition_item_id,
    requisition_id: app.requisition_id,
    full_name: app.candidate.full_name,
    email: app.candidate.email,
    phone: app.candidate.phone,
    resume_path: null,
    current_stage: app.current_stage,
    added_by: app.created_by,
    source: app.source,
    created_at: app.created_at,
    updated_at: app.updated_at,
    stage_history: app.stage_history,
    interviews: [],
  };
}

/**
 * Phase 4 compatibility adapter:
 * primary read path is applications API while preserving existing Candidate shape.
 */
export async function fetchCandidatesFromApplications(params: {
  requisition_id?: number;
  requisition_item_id?: number;
}): Promise<Candidate[]> {
  try {
    const { data } = await apiClient.get<ApplicationRecord[]>("/applications", {
      params,
    });
    return data.map(mapApplicationToCandidate);
  } catch {
    // Compatibility fallback while older environments roll out applications API.
    if (params.requisition_item_id != null) {
      return fetchCandidatesByItem(params.requisition_item_id);
    }
    if (params.requisition_id != null) {
      return fetchCandidates(params.requisition_id);
    }
    return [];
  }
}

export async function fetchApplicationsPipeline(params: {
  requisition_id?: number;
  requisition_item_id?: number;
  compact?: boolean;
}): Promise<ApplicationsPipelineResponse> {
  const { data } = await apiClient.get<ApplicationsPipelineResponse>(
    "/applications/pipeline",
    {
      params: {
        ...params,
        compact: params.compact ? 1 : undefined,
      },
    },
  );
  return data;
}

export async function getApplication(
  applicationId: number,
): Promise<ApplicationRecord> {
  const { data } = await apiClient.get<ApplicationRecord>(
    `/applications/${applicationId}`,
  );
  return data;
}

export async function fetchRequisitionItemRanking(
  itemId: number,
): Promise<RequisitionItemRankingResponse> {
  const { data } = await apiClient.get<RequisitionItemRankingResponse>(
    `/ranking/requisition-items/${itemId}`,
  );
  return data;
}

export async function recomputeRequisitionItemRanking(
  itemId: number,
): Promise<RequisitionItemRankingResponse> {
  const { data } = await apiClient.post<RequisitionItemRankingResponse>(
    `/ranking/requisition-items/${itemId}`,
  );
  return data;
}

export async function getCandidateWithApplication(
  candidateId: number,
  applicationId?: number,
): Promise<Candidate> {
  const [candidate, app] = await Promise.all([
    getCandidate(candidateId),
    applicationId ? getApplication(applicationId) : Promise.resolve(null),
  ]);
  if (!app) {
    return candidate;
  }
  return {
    ...candidate,
    application_id: app.application_id,
    source: app.source,
    stage_history: app.stage_history ?? [],
    current_stage: app.current_stage,
    requisition_item_id: app.requisition_item_id,
    requisition_id: app.requisition_id,
  };
}

export async function updateCandidateStageCompatible(
  candidate: Candidate,
  payload: CandidateStageUpdate,
): Promise<Candidate> {
  if (candidate.application_id) {
    try {
      const app = await apiClient
        .patch<ApplicationRecord>(
          `/applications/${candidate.application_id}/stage`,
          payload,
        )
        .then((r) => r.data);
      const fresh = await getCandidate(candidate.candidate_id);
      return {
        ...fresh,
        application_id: app.application_id,
        source: app.source,
        stage_history: app.stage_history ?? [],
        current_stage: app.current_stage,
        requisition_item_id: app.requisition_item_id,
        requisition_id: app.requisition_id,
      };
    } catch {
      // Compatibility fallback if application endpoint is unavailable.
      return updateCandidateStage(candidate.candidate_id, payload);
    }
  }
  return updateCandidateStage(candidate.candidate_id, payload);
}

export async function deleteCandidate(candidateId: number): Promise<void> {
  await apiClient.delete(`/candidates/${candidateId}`);
}

// ============================================================================
// INTERVIEW ENDPOINTS
// ============================================================================

export async function fetchInterviews(
  candidateId: number,
): Promise<Interview[]> {
  const { data } = await apiClient.get<Interview[]>("/interviews/", {
    params: { candidate_id: candidateId },
  });
  return data;
}

export async function createInterview(
  payload: InterviewCreate,
): Promise<Interview> {
  const { data } = await apiClient.post<Interview>("/interviews/", payload);
  return data;
}

export async function updateInterview(
  interviewId: number,
  payload: InterviewUpdate,
): Promise<Interview> {
  const { data } = await apiClient.patch<Interview>(
    `/interviews/${interviewId}`,
    payload,
  );
  return data;
}

export async function deleteInterview(interviewId: number): Promise<void> {
  await apiClient.delete(`/interviews/${interviewId}`);
}

// ============================================================================
// RESUME UPLOAD
// ============================================================================

export async function uploadResume(
  file: File,
): Promise<{ file_url: string; filename: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post<{ file_url: string; filename: string }>(
    "/uploads/resume",
    formData,
  );
  return data;
}
