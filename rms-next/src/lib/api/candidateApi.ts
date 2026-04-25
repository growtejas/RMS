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
    response?: { status?: number; data?: { detail?: string; error?: string } };
  };
  const body = ax?.response?.data;
  const message =
    typeof body?.error === "string"
      ? body.error
      : typeof body?.detail === "string"
        ? body.detail
        : undefined;
  if (ax?.response?.status === 403) {
    return typeof message === "string" && message.trim().length > 0
      ? message
      : TA_OWNERSHIP_DENIED_MESSAGE;
  }
  return typeof message === "string" ? message : fallback;
}

// ============================================================================
// TYPES
// ============================================================================

export interface InterviewPanelist {
  id: number;
  user_id: number | null;
  display_name: string;
  role_label: string | null;
}

export interface Interview {
  id: number;
  candidate_id: number;
  requisition_item_id?: number | null;
  /** Present on manager-scoped list responses. */
  requisition_id?: number | null;
  /** Present on manager-scoped list responses. */
  role_position?: string | null;
  round_number: number;
  round_name?: string | null;
  round_type?: string | null;
  interview_mode?: string | null;
  interviewer_name?: string | null;
  scheduled_at: string;
  end_time?: string;
  timezone?: string;
  meeting_link?: string | null;
  location?: string | null;
  notes?: string | null;
  status: string;
  result: string | null;
  feedback: string | null;
  conducted_by: number | null;
  created_by?: number | null;
  updated_by?: number | null;
  created_at: string | null;
  updated_at: string | null;
  panelists?: InterviewPanelist[];
  /** Present on list responses joined with candidates. */
  candidate_name?: string | null;
  candidate_email?: string | null;
}

type InterviewApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

/** Present on GET /api/candidates/:id — local resume parser output / cache. */
export interface ResumeParseRecord {
  v: number | null;
  parser_provider: string | null;
  parser_version: string | null;
  status: string | null;
  source_resume_ref: string | null;
  raw_text: string | null;
  parsed_data: Record<string, unknown> | null;
  error_message: string | null;
  stored_resume_path: string | null;
}

/** Present on GET /api/candidates/:id when `resume_structured_profile` exists in DB. */
export interface ResumeStructuredSummary {
  schema_version: number;
  extractor: string;
  confidence_overall: number;
  warnings: string[];
  issue_tags: string[];
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
  /** Filled when loading a single candidate from the API (not always on list payloads). */
  resume_parse?: ResumeParseRecord | null;
  /** Rules/LLM structured resume summary for parse-quality UI. */
  resume_structured?: ResumeStructuredSummary | null;
  total_experience_years?: number | null;
  notice_period_days?: number | null;
  is_referral?: boolean;
  candidate_skills?: string[] | null;
  education_raw?: string | null;
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
    final_score: number | null;
    ai_status: "OK" | "PENDING" | "UNAVAILABLE";
    ai_confidence?: number;
    ai_summary?: string;
    ai_risks?: string[];
  };
  explain: {
    reasons: string[];
    // In strict ai_only responses, deterministic explain fields are omitted.
    ai_score?: number;
    ai_summary?: string;
    ai_risks?: string[];
    ai_confidence?: number;
    ranking_signals?: {
      ats?: {
        experience_years?: number | null;
      };
    };
  };
}

export interface RequisitionItemRankingResponse {
  ranking_engine: "ai_only";
  requisition_item_id: number;
  req_id: number;
  ranking_version: string;
  generated_at: string;
  total_candidates: number;
  ranked_candidates: RequisitionItemRankingCandidate[];
  meta?: {
    ranking_engine: "ai_only";
    ai_eval_enriched: boolean;
  };
}

/** GET /api/ranking/requisition-items/{itemId}/job-requirements */
export interface RankingJobRequirementsResponse {
  ranking_engine: "ai_only";
  requisition_item_id: number;
  req_id: number;
  jd_narrative: {
    source: "requisition_jd" | "pipeline_jd";
    use_requisition_jd: boolean;
    has_pipeline_jd_file: boolean;
    char_length: number;
    excerpt: string;
  };
  composite_scoring_text: {
    char_length: number;
    excerpt: string;
    parts_included: string[];
  };
  required_skills: {
    normalized_tokens: string[];
    resolution_path: string;
  };
  ats_job_profile: {
    required_experience_years: number | null;
    job_skill_level: string | null;
    job_education_requirement: string | null;
  };
  scoring_config: {
    ranking_engine: "ai_only";
  };
  item_snapshot: {
    role_position: string;
    requirements_excerpt: string | null;
    job_description_excerpt: string | null;
  };
  control: {
    update_ranking_inputs: {
      method: string;
      path: string;
      body: Record<string, string>;
    };
    recompute_ranking: { method: string; path: string };
    notes: string[];
  };
}

/** GET /api/ranking/requisition-items/{itemId}/candidates/{candidateId}/scoring-details */
export interface CandidateScoringDetailsResponse {
  ranking_engine: "ai_only";
  requisition_item_id: number;
  req_id: number;
  candidate_id: number;
  full_name: string;
  email: string;
  current_stage: string;
  generated_at: string;
  ranking_version: string;
  total_candidates: number;
  score: RequisitionItemRankingCandidate["score"];
  explain: RequisitionItemRankingCandidate["explain"];
  job_requirements: RankingJobRequirementsResponse;
  flags?: string[];
  meta?: RequisitionItemRankingCandidate["meta"] & {
    ranking_engine?: "ai_only";
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

export interface InterviewCreateV2 {
  candidate_id: number;
  requisition_item_id: number;
  round_name: string;
  round_type: "TECHNICAL" | "HR" | "MANAGERIAL";
  interview_mode: "ONLINE" | "OFFLINE";
  scheduled_at: string;
  end_time: string;
  timezone: string;
  interviewer_ids: number[];
  meeting_link?: string | null;
  location?: string | null;
  notes?: string | null;
}

export type InterviewCreatePayload = InterviewCreate | InterviewCreateV2;

export interface InterviewUpdate {
  interviewer_name?: string;
  scheduled_at?: string;
  end_time?: string;
  timezone?: string;
  meeting_link?: string | null;
  location?: string | null;
  notes?: string | null;
  round_name?: string | null;
  round_type?: InterviewCreateV2["round_type"];
  interview_mode?: InterviewCreateV2["interview_mode"];
  interviewer_ids?: number[];
  status?: string;
  result?: string | null;
  feedback?: string | null;
  reschedule_reason?: string;
}

export interface InterviewMutationResult {
  interview: Interview;
  warnings: string[];
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

export async function fetchCandidateScoringDetails(
  itemId: number,
  candidateId: number,
  options?: { aiEval?: boolean; strictSnapshot?: boolean },
): Promise<CandidateScoringDetailsResponse> {
  const params: Record<string, string | number> = {};
  if (options?.aiEval) params.ai_eval = 1;
  if (options?.strictSnapshot) params.strict_snapshot = 1;
  const { data } = await apiClient.get<CandidateScoringDetailsResponse>(
    `/ranking/requisition-items/${itemId}/candidates/${candidateId}/scoring-details`,
    {
      timeout: RANKING_CLIENT_TIMEOUT_MS,
      params: Object.keys(params).length > 0 ? params : undefined,
    },
  );
  return data;
}

export async function fetchRankingJobRequirements(
  itemId: number,
): Promise<RankingJobRequirementsResponse> {
  const { data } = await apiClient.get<RankingJobRequirementsResponse>(
    `/ranking/requisition-items/${itemId}/job-requirements`,
    { timeout: RANKING_CLIENT_TIMEOUT_MS },
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
  const { data } = await apiClient.get<
    InterviewApiEnvelope<{ interviews: Interview[] }>
  >("/interviews/", {
    params,
  });
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to load interviews");
  }
  return data.data.interviews;
}

export async function fetchManagerInterviews(): Promise<Interview[]> {
  const { data } = await apiClient.get<
    InterviewApiEnvelope<{ interviews: Interview[] }>
  >("/manager/interviews");
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to load interviews");
  }
  return data.data.interviews;
}

export async function createInterview(
  payload: InterviewCreatePayload,
): Promise<InterviewMutationResult> {
  const { data } = await apiClient.post<
    InterviewApiEnvelope<InterviewMutationResult>
  >("/interviews/", payload);
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to create interview");
  }
  return data.data;
}

export async function createManagerInterview(
  payload: InterviewCreateV2,
): Promise<InterviewMutationResult> {
  const { data } = await apiClient.post<
    InterviewApiEnvelope<InterviewMutationResult>
  >("/manager/interviews/schedule", payload);
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to schedule interview");
  }
  return data.data;
}

export async function updateInterview(
  interviewId: number,
  payload: InterviewUpdate,
): Promise<InterviewMutationResult> {
  const { data } = await apiClient.patch<
    InterviewApiEnvelope<InterviewMutationResult>
  >(`/interviews/${interviewId}`, payload);
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to update interview");
  }
  return data.data;
}

export async function deleteInterview(interviewId: number): Promise<void> {
  const { data } = await apiClient.delete<
    InterviewApiEnvelope<{ deleted: boolean }>
  >(`/interviews/${interviewId}`);
  if (!data.success) {
    throw new Error(data.error ?? "Failed to delete interview");
  }
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
