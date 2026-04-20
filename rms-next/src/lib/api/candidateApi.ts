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

/** Ranking can parse many resumes / embeddings; default axios 25s is often too short. */
const RANKING_CLIENT_TIMEOUT_MS = 180_000;

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
  /** Present on list responses joined with candidates. */
  candidate_name?: string | null;
  candidate_email?: string | null;
}

export interface Candidate {
  candidate_id: number;
  person_id?: number;
  application_id?: number;
  requisition_item_id: number;
  requisition_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  resume_path: string | null;
  total_experience_years?: number | null;
  notice_period_days?: number | null;
  is_referral?: boolean;
  candidate_skills?: string[] | null;
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
  /** BEST | VERY_GOOD | GOOD | AVERAGE | NOT_SUITABLE — set after ranking recompute. */
  ats_bucket?: string | null;
  source: string;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  candidate: {
    candidate_id: number;
    person_id?: number;
    full_name: string;
    email: string;
    phone: string | null;
    resume_path: string | null;
  };
  stage_history?: ApplicationStageHistory[];
  /** Present on `group_by=ats_bucket` responses when latest ranking scores exist. */
  ranking?: {
    ranking_version_id: number;
    final_score: number | null;
    breakdown: Record<string, unknown>;
  } | null;
}

export interface ApplicationsAtsBucketsResponse {
  requisition_item_id: number;
  BEST: ApplicationRecord[];
  VERY_GOOD: ApplicationRecord[];
  GOOD: ApplicationRecord[];
  AVERAGE: ApplicationRecord[];
  NOT_SUITABLE: ApplicationRecord[];
  UNRANKED: ApplicationRecord[];
  meta: {
    limit_per_bucket: number;
    truncated: Record<string, boolean>;
    total: number;
    /** Latest ranking version used for `ranking` fields on each application. */
    ranking_version_id: number | null;
  };
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
  meta?: {
    skill_match_ratio?: number;
    notice_period_days?: number | null;
    application_created_at_ms?: number;
  };
  score: {
    keyword_score: number;
    semantic_score: number;
    business_score: number;
    ats_v1_score?: number;
    final_score: number;
    deterministic_final_score?: number;
  };
  explain: {
    reasons: string[];
    matched_terms: string[];
    missing_terms: string[];
    matched_skills?: string[];
    missing_skills?: string[];
    deterministic_final_score?: number;
    ai_score?: number;
    ai_summary?: string;
    ai_risks?: string[];
    ai_confidence?: number;
    ai_blend_weight?: number;
    ranking_signals?: {
      ats?: { experience_years?: number | null };
    };
    ats_v1?: {
      skills?: number;
      experience: number;
      notice: number;
      education?: number;
      seniority?: number;
      bonus?: number;
      matched_skills?: number;
      required_skills?: number;
      partial_data: boolean;
      flags?: string[];
    };
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
  meta?: {
    ranking_engine: string;
    ats_v1_weight: number;
    ranking_version_id: number;
    required_skills_count?: number;
    ai_eval_enriched?: boolean;
  };
}

export interface CandidateCreate {
  requisition_item_id: number;
  requisition_id: number;
  full_name: string;
  email: string;
  phone?: string;
  resume_path?: string;
  total_experience_years?: number | null;
  notice_period_days?: number | null;
  is_referral?: boolean;
  candidate_skills?: string[] | null;
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
    person_id: app.candidate.person_id,
    application_id: app.application_id,
    requisition_item_id: app.requisition_item_id,
    requisition_id: app.requisition_id,
    full_name: app.candidate.full_name,
    email: app.candidate.email,
    phone: app.candidate.phone,
    resume_path: app.candidate.resume_path ?? null,
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

/** Applications for a requisition (Phase 2 ATS list; plain list, no group_by). */
export async function fetchApplicationsByRequisition(
  requisitionId: number,
): Promise<ApplicationRecord[]> {
  const { data } = await apiClient.get<ApplicationRecord[]>("/applications", {
    params: { requisitionId },
  });
  return data;
}

/** Recent applications across the org (for global Candidates roster). */
export async function fetchApplicationsOrgRoster(
  limit = 500,
): Promise<ApplicationRecord[]> {
  const { data } = await apiClient.get<ApplicationRecord[]>("/applications", {
    params: { limit },
  });
  return data;
}

export async function fetchCandidatesFromApplications(params: {
  requisition_id?: number;
  requisition_item_id?: number;
}): Promise<Candidate[]> {
  try {
    const query: Record<string, number> = {};
    if (params.requisition_id != null) {
      query.requisitionId = params.requisition_id;
    }
    if (params.requisition_item_id != null) {
      query.requisition_item_id = params.requisition_item_id;
    }
    const { data } = await apiClient.get<ApplicationRecord[]>("/applications", {
      params: query,
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

/** GET /api/applications?group_by=ats_bucket — Kanban-style quality buckets. */
export async function fetchApplicationsAtsBuckets(
  requisitionItemId: number,
  limitPerBucket = 80,
): Promise<ApplicationsAtsBucketsResponse> {
  const { data } = await apiClient.get<ApplicationsAtsBucketsResponse>(
    "/applications",
    {
      params: {
        requisition_item_id: requisitionItemId,
        group_by: "ats_bucket",
        limit_per_bucket: limitPerBucket,
      },
    },
  );
  return data;
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
  options?: { aiEval?: boolean },
): Promise<RequisitionItemRankingResponse> {
  const { data } = await apiClient.get<RequisitionItemRankingResponse>(
    `/ranking/requisition-items/${itemId}`,
    {
      timeout: RANKING_CLIENT_TIMEOUT_MS,
      params: options?.aiEval ? { ai_eval: 1 } : undefined,
    },
  );
  return data;
}

export async function recomputeRequisitionItemRanking(
  itemId: number,
): Promise<RequisitionItemRankingResponse> {
  const { data } = await apiClient.post<RequisitionItemRankingResponse>(
    `/ranking/requisition-items/${itemId}`,
    {},
    { timeout: RANKING_CLIENT_TIMEOUT_MS },
  );
  return data;
}

export async function runAiEvaluationForRequisitionItem(
  itemId: number,
  payload: {
    candidate_ids?: number[];
    top_n?: number;
    force?: boolean;
    include_eval_input?: boolean;
  },
): Promise<{
  requisition_item_id: number;
  results: Array<
    | { candidate_id: number; status: "ok"; ai_score: number; input_hash?: string }
    | {
        candidate_id: number;
        status: "skipped_cache";
        ai_score: number;
        input_hash?: string;
      }
    | { candidate_id: number; status: "disabled" }
    | { candidate_id: number; status: "not_found" }
    | {
        candidate_id: number;
        status: "llm_failed";
        input_hash?: string;
        llm_failure_reason?: string;
        llm_http_status?: number;
      }
  >;
  meta?: Record<string, unknown>;
}> {
  const { data } = await apiClient.post(
    `/ranking/requisition-items/${itemId}/ai-evaluation`,
    payload,
    { timeout: RANKING_CLIENT_TIMEOUT_MS },
  );
  return data as {
    requisition_item_id: number;
    results: Array<
      | { candidate_id: number; status: "ok"; ai_score: number; input_hash?: string }
      | {
          candidate_id: number;
          status: "skipped_cache";
          ai_score: number;
          input_hash?: string;
        }
      | { candidate_id: number; status: "disabled" }
      | { candidate_id: number; status: "not_found" }
      | {
          candidate_id: number;
          status: "llm_failed";
          input_hash?: string;
          llm_failure_reason?: string;
          llm_http_status?: number;
        }
    >;
    meta?: Record<string, unknown>;
  };
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

export async function fetchInterviews(filters: {
  candidateId?: number;
  requisitionId?: number;
}): Promise<Interview[]> {
  const params: Record<string, number> = {};
  if (filters.candidateId != null) {
    params.candidate_id = filters.candidateId;
  }
  if (filters.requisitionId != null) {
    params.requisitionId = filters.requisitionId;
  }
  const { data } = await apiClient.get<Interview[]>("/interviews/", {
    params,
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
