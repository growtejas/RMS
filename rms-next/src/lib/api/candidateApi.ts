/**
 * ============================================================================
 * CANDIDATE & INTERVIEW API
 * ============================================================================
 *
 * CRUD + pipeline operations for the Candidate Pipeline feature.
 * Replaces the old "Available Employees" placeholder.
 */

import { TA_OWNERSHIP_DENIED_MESSAGE } from "@/lib/auth/ownership-messages";
import {
  PAGE_SIZE_OPTIONS,
  type PageSize as PageSizeType,
  type PaginatedData,
  type PaginatedEnvelope,
} from "@/lib/pagination/contract";
import {
  parseStoredCandidateReport,
  type CandidateReport,
  type ParsedCandidate,
} from "@/lib/services/cie/cie.schema";
import type { RoleMaster } from "@/lib/services/cie/role-catalog";

import { apiClient } from "./client";

/**
 * Canonical page-size whitelist (25 / 50 / 100). Re-exported as
 * `CIE_PAGE_SIZE_OPTIONS` so legacy code keeps compiling while we migrate
 * consumers off the alias.
 */
export const CIE_PAGE_SIZE_OPTIONS = PAGE_SIZE_OPTIONS;
export type CiePageSize = PageSizeType;
export type { PaginationMeta } from "@/lib/pagination/contract";

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
    typeof body?.detail === "string" && body.detail.trim().length > 0
      ? body.detail
      : typeof body?.error === "string"
        ? body.error
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

/** CIE report payload on GET /api/candidates/:id (`cie_intel.latest_report`). */
export type CandidateCieReport = CandidateReport;

/** Tolerates legacy string[] suitableRoles from older stored reports. */
export function hydrateCandidateCieReport(raw: unknown): CandidateCieReport | null {
  const p = parseStoredCandidateReport(raw);
  return p.ok ? p.data : null;
}

export function normalizeCandidateCieIntel<T extends { cie_intel?: Candidate["cie_intel"] }>(
  row: T,
): T {
  const ci = row.cie_intel;
  if (!ci?.latest_report) return row;
  const latest = hydrateCandidateCieReport(ci.latest_report as unknown);
  return {
    ...row,
    cie_intel: {
      ...ci,
      latest_report: latest,
    },
  };
}

export interface CandidateCieIntel {
  latest_report: CandidateCieReport | null;
  last_evaluated_at: string | null;
  confidence_score: number | null;
  model_version: string | null;
  parsed_data_version: number | null;
  /** Present on list responses with `cie_summary=1` when the latest run stored an error. */
  last_error?: string | null;
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
  /** Candidate Intelligence Engine — present on single-candidate GET. */
  cie_intel?: CandidateCieIntel | null;
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
  /** From latest CIE report (`suitableRoles` / `experienceLevel`). */
  suitable_roles?: string[] | null;
  /** Canonical role ids from latest CIE report (talent discovery). */
  suitable_role_ids?: string[] | null;
  experience_level?: string | null;
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

/**
 * Internal helper: read a `Candidate[]` from either the canonical paginated
 * envelope (`{ success, data: { items, pagination }, error }`) or, defensively,
 * a legacy bare-array body. We default `limit=100` so legacy callers that
 * expected the full list still get a useful page; callers that need every row
 * should switch to `fetchCandidatesPage` instead.
 */
async function fetchCandidatesArray(
  params: Record<string, string | number>,
): Promise<Candidate[]> {
  const { data } = await apiClient.get<unknown>("/candidates/", { params });
  if (Array.isArray(data)) {
    return data as Candidate[];
  }
  const envelope = data as { data?: { items?: Candidate[] } } | undefined;
  return envelope?.data?.items ?? [];
}

export async function fetchCandidates(
  requisitionId: number,
): Promise<Candidate[]> {
  return fetchCandidatesArray({ requisition_id: requisitionId, limit: 100 });
}

export async function fetchCandidatesByItem(
  itemId: number,
): Promise<Candidate[]> {
  return fetchCandidatesArray({ requisition_item_id: itemId, limit: 100 });
}

/** Canonical paginated reader for `/api/candidates`. New callers should use this. */
export async function fetchCandidatesPage(opts: {
  page: number;
  limit: PageSizeType;
  q?: string | null;
  role?: string | null;
  sort?: CieCandidateSort | null;
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
  includeCieSummary?: boolean;
  signal?: AbortSignal;
}): Promise<PaginatedData<Candidate>> {
  const params: Record<string, string | number> = {
    page: opts.page,
    limit: opts.limit,
  };
  if (opts.q?.trim()) params.q = opts.q.trim();
  if (opts.role?.trim()) params.role = opts.role.trim();
  if (opts.sort?.trim()) params.sort = opts.sort.trim();
  if (opts.requisitionId != null) params.requisition_id = opts.requisitionId;
  if (opts.requisitionItemId != null) params.requisition_item_id = opts.requisitionItemId;
  if (opts.currentStage?.trim()) params.current_stage = opts.currentStage.trim();
  if (opts.includeCieSummary) params.cie_summary = 1;
  const { data } = await apiClient.get<PaginatedEnvelope<Candidate>>(
    "/candidates/",
    { params, signal: opts.signal },
  );
  const items = (data?.data?.items ?? []).map((row) =>
    normalizeCandidateCieIntel(row),
  );
  const pagination = data?.data?.pagination ?? {
    page: opts.page,
    limit: opts.limit,
    total: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  return { items, pagination };
}

export interface FetchOrgCandidatesCieOptions {
  /** Canonical role id (e.g. data_engineer). */
  roleId?: string | null;
  /** Free-text filter on name / email (server-side). */
  q?: string | null;
}

export type CieCandidateSort =
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "last_evaluated_desc";

export async function fetchCieCandidatesPage(opts: {
  page: number;
  limit: PageSizeType;
  q?: string | null;
  role?: string | null;
  sort?: CieCandidateSort | null;
  signal?: AbortSignal;
}): Promise<PaginatedData<Candidate>> {
  const params: Record<string, string | number> = {
    page: opts.page,
    limit: opts.limit,
  };
  if (opts.q?.trim()) params.q = opts.q.trim();
  if (opts.role?.trim()) params.role = opts.role.trim();
  if (opts.sort?.trim()) params.sort = opts.sort.trim();
  const { data } = await apiClient.get<PaginatedEnvelope<Candidate>>(
    "/cie/candidates",
    { params, signal: opts.signal },
  );
  const rows = Array.isArray(data?.data?.items) ? data.data.items : [];
  const pagination = data?.data?.pagination ?? {
    page: opts.page,
    limit: opts.limit,
    total: rows.length,
    totalPages: rows.length > 0 ? 1 : 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  return {
    items: rows.map((row) => normalizeCandidateCieIntel(row)),
    pagination,
  };
}

export async function fetchCieCandidateIds(opts: {
  q?: string | null;
  role?: string | null;
}): Promise<{ ids: number[]; total: number }> {
  const params: Record<string, string> = {};
  if (opts.q?.trim()) params.q = opts.q.trim();
  if (opts.role?.trim()) params.role = opts.role.trim();
  const { data } = await apiClient.get<{
    success: boolean;
    data: number[];
    meta: { total: number };
  }>("/cie/candidates/ids", { params });
  return {
    ids: Array.isArray(data?.data) ? data.data : [],
    total: data?.meta?.total ?? 0,
  };
}

/** Organization-wide candidate rows with `cie_intel` including latest CIE report when available. */
export async function fetchOrgCandidatesWithCieSummary(
  opts?: FetchOrgCandidatesCieOptions,
): Promise<Candidate[]> {
  const params: Record<string, string | number> = { cie_summary: 1, limit: 100 };
  if (opts?.roleId?.trim()) params.role = opts.roleId.trim();
  if (opts?.q?.trim()) params.q = opts.q.trim();
  const rows = await fetchCandidatesArray(params);
  return rows.map((row) => normalizeCandidateCieIntel(row));
}

/** Canonical CIE role catalog for typeahead / display labels. */
export async function fetchCieRoleCatalog(): Promise<RoleMaster[]> {
  const { data } = await apiClient.get<{ roles: RoleMaster[] }>("/cie/role-catalog");
  return Array.isArray(data?.roles) ? data.roles : [];
}

export async function getCandidate(candidateId: number): Promise<Candidate> {
  const { data } = await apiClient.get<Candidate>(`/candidates/${candidateId}`);
  return normalizeCandidateCieIntel(data);
}

/** Per-field provenance for adaptive v2 (read-only, UI/debug only). */
export interface ParsedResumeV2Prov {
  source:
    | "rules"
    | "llm"
    | "hybrid"
    | "header"
    | "skills_section"
    | "experience_section"
    | "projects_section"
    | "education_section"
    | "achievements_section"
    | "certifications_section"
    | "publications_section"
    | "patents_section"
    | "profiles_section"
    | "leadership_section"
    | "languages_section"
    | "awards_section"
    | "unknown";
  confidence: number;
}

export interface ParsedResumeV2ValString {
  value: string | null;
  prov: ParsedResumeV2Prov;
}

export type ParsedResumeV2ProfileType =
  | "fresher"
  | "mid"
  | "senior"
  | "academic"
  | "managerial"
  | "unknown";

export interface ParsedResumeV2Core {
  basicInfo: {
    name: ParsedResumeV2ValString;
    email: ParsedResumeV2ValString;
    phone: ParsedResumeV2ValString;
    location?: ParsedResumeV2ValString;
    headline?: ParsedResumeV2ValString;
  };
  skills: Array<{ name: string; prov: ParsedResumeV2Prov }>;
  experience: Array<{
    company: string;
    role: string;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    durationMonths: number | null;
    bullets: string[];
    techStack: string[];
    prov: ParsedResumeV2Prov;
  }>;
  projects: Array<{
    title: string;
    description: string;
    techStack: string[];
    startDate: string | null;
    endDate: string | null;
    link: string | null;
    prov: ParsedResumeV2Prov;
  }>;
  education: Array<{
    degree: string;
    specialization: string | null;
    university: string;
    startDate: string | null;
    endDate: string | null;
    year: number | null;
    score: string | null;
    location: string | null;
    prov: ParsedResumeV2Prov;
  }>;
}

export interface ParsedResumeV2Rich {
  achievements?: Array<{ title: string; description: string | null }>;
  certifications?: Array<{
    name: string;
    issuer: string | null;
    year: number | null;
  }>;
  publications?: Array<{
    title: string;
    venue: string | null;
    year: number | null;
    link: string | null;
  }>;
  patents?: Array<{ title: string; number: string | null; year: number | null }>;
  profiles?: Array<{
    kind: "github" | "linkedin" | "portfolio" | "leetcode" | "twitter" | "other";
    url: string;
  }>;
  leadership?: Array<{
    role: string;
    org: string | null;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
  }>;
  languages?: string[];
  awards?: string[];
  summary?: string;
}

export interface ParsedResumeV2 {
  schema: "strict_resume_v2";
  profile_type: ParsedResumeV2ProfileType;
  profile_type_confidence: number;
  core: ParsedResumeV2Core;
  rich?: ParsedResumeV2Rich;
  warnings: string[];
}

export interface ParsedResumeV2Summary {
  profile_type: ParsedResumeV2ProfileType;
  profile_type_confidence: number;
  counts: {
    skills: number;
    experience: number;
    projects: number;
    education: number;
    achievements: number;
    certifications: number;
    publications: number;
    patents: number;
    profiles: number;
    leadership: number;
    languages: number;
    awards: number;
  };
  total_experience_years: number | null;
  warnings: string[];
}

export interface ParsedResumeV2ProcessorPayload {
  schema: "candidate_processor_v1";
  candidate_id: number;
  requisition_id: number | null;
  organization_id: number | null;
  generated_at: string;
  profile: {
    type: ParsedResumeV2ProfileType;
    type_confidence: number;
    total_experience_years: number | null;
  };
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
  };
  skills: string[];
  experience: Array<{
    company: string;
    role: string;
    start_date: string | null;
    end_date: string | null;
    duration_months: number | null;
    highlights: string[];
    tech_stack: string[];
    confidence: number;
  }>;
  projects: Array<{
    title: string;
    description: string;
    tech_stack: string[];
    start_date: string | null;
    end_date: string | null;
    confidence: number;
  }>;
  education: Array<{
    degree: string;
    specialization: string | null;
    university: string;
    year: number | null;
    score: string | null;
    confidence: number;
  }>;
  extras: {
    achievements: Array<{ title: string; description: string | null }>;
    profiles: Array<{ kind: string; url: string }>;
  };
  quality: {
    warnings: string[];
    source: "parsed_candidate_v2";
  };
}

/** GET /api/candidates/{id}/parsed-resume — legacy parser cache + CIE `ParsedCandidate` projection. */
export interface CandidateParsedResumeResponse {
  detail?: string;
  resume_parse: ResumeParseRecord | null;
  /** Legacy fallback-local v2 → CIE projection (same as before). */
  parsed_candidate?: ParsedCandidate | null;
  parsed_candidate_error?: string | null;
  /** Rules / `resume_structured_profile` → CIE shape (employment, richer fields when pipeline ran). */
  parsed_candidate_structured?: ParsedCandidate | null;
  parsed_candidate_structured_error?: string | null;
  legacy_parser_hints?: {
    experience_years: number | null;
    notice_period_days: number | null;
  };
  /** Mirrors server `CIE_PARSER_SOURCE` when this response was built. */
  cie_parser_source?: "legacy" | "structured";
  /** Which snapshot CIE would use first (with fallback), without persisting. */
  cie_effective_parsed_candidate?: ParsedCandidate | null;
  cie_effective_source?: "legacy" | "structured" | null;
  cie_effective_legacy_hints?: {
    experience_years: number | null;
    notice_period_days: number | null;
  } | null;
  /**
   * Adaptive v2 (UI/debug). Present only when `RESUME_STRUCTURE_V2_ENABLED=true`
   * or the request was made with `?v2=1`. Not used by ranking or CIE.
   */
  parsed_candidate_v2?: ParsedResumeV2 | null;
  parsed_candidate_v2_error?: string | null;
  /** v2 projected onto the stable CIE `ParsedCandidate` shape (parity preview). */
  parsed_candidate_v2_preview?: ParsedCandidate | null;
  /** Lightweight v2 summary (counts + classifier) for UI headers. */
  parsed_candidate_v2_summary?: ParsedResumeV2Summary | null;
  /** Stable downstream contract derived from parsed_candidate_v2. */
  parsed_candidate_v2_processor_payload?: ParsedResumeV2ProcessorPayload | null;
  from_cache: boolean;
}

export interface FetchCandidateParsedResumeOptions {
  /** Request lean v2-focused payload (`parsed_candidate_v2*`) from API. */
  view?: "full" | "v2";
  /** Include legacy/debug blocks even when `view=v2`. */
  debug?: boolean;
  /**
   * Force v2 generation by query param (helpful when env gate is off).
   * API still decides final behavior.
   */
  v2?: boolean;
}

export async function fetchCandidateParsedResume(
  candidateId: number,
  options?: FetchCandidateParsedResumeOptions,
): Promise<CandidateParsedResumeResponse> {
  const { data } = await apiClient.get<CandidateParsedResumeResponse>(
    `/candidates/${candidateId}/parsed-resume`,
    {
      params: {
        ...(options?.view ? { view: options.view } : {}),
        ...(options?.debug ? { debug: "1" } : {}),
        ...(options?.v2 ? { v2: "1" } : {}),
      },
    },
  );
  return data;
}

export async function requestCieRecompute(
  candidateIds: number[],
  force?: boolean,
): Promise<{ bulk_job_id: string; queued: number; status: string }> {
  const { data } = await apiClient.post<{
    bulk_job_id: string;
    queued: number;
    status: string;
  }>("/candidates/recompute", {
    candidateIds,
    force: force ?? false,
  });
  return data;
}

export async function requestCieRematerializeV2(
  candidateIds: number[],
  enqueueRecompute?: boolean,
): Promise<{ bulk_job_id: string; queued: number; status: string }> {
  const { data } = await apiClient.post<{
    bulk_job_id: string;
    queued: number;
    status: string;
  }>("/cie/candidates/rematerialize", {
    candidateIds,
    enqueueRecompute: enqueueRecompute ?? true,
  });
  return data;
}

export async function fetchCieRecomputeJob(jobId: string): Promise<{
  bulk_job_id: string;
  status: string;
  kind: string;
  progress_pct: number;
  counts: {
    expected: number | null;
    processed: number | null;
    ok: number | null;
    failed: number | null;
    skipped: number | null;
  };
  redis: Record<string, string> | null;
  result_summary: unknown;
}> {
  const { data } = await apiClient.get(`/candidates/recompute/${jobId}`);
  return data as {
    bulk_job_id: string;
    status: string;
    kind: string;
    progress_pct: number;
    counts: {
      expected: number | null;
      processed: number | null;
      ok: number | null;
      failed: number | null;
      skipped: number | null;
    };
    redis: Record<string, string> | null;
    result_summary: unknown;
  };
}

export async function askCandidateCie(
  candidateId: number,
  question: string,
  targetRole: string | null | undefined,
): Promise<{ answer: string; confidence: number }> {
  const { data } = await apiClient.post<{ answer: string; confidence: number }>(
    `/candidates/${candidateId}/ask`,
    { question, targetRole: targetRole ?? null },
  );
  return data;
}

export async function fetchCieConversations(
  candidateId: number,
  limit?: number,
): Promise<{
  conversations: Array<{
    id: number;
    question: string;
    answer: string;
    confidence: number | null;
    created_at: string;
  }>;
}> {
  const { data } = await apiClient.get(`/candidates/${candidateId}/conversations`, {
    params: limit != null ? { limit } : undefined,
  });
  return data as {
    conversations: Array<{
      id: number;
      question: string;
      answer: string;
      confidence: number | null;
      created_at: string;
    }>;
  };
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

/** Canonical paginated reader for `/api/applications`. */
export async function fetchApplicationsPage(opts: {
  page: number;
  limit: PageSizeType;
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  candidateId?: number | null;
  currentStage?: string | null;
  signal?: AbortSignal;
}): Promise<PaginatedData<ApplicationRecord>> {
  const params: Record<string, string | number> = {
    page: opts.page,
    limit: opts.limit,
  };
  if (opts.requisitionId != null) params.requisitionId = opts.requisitionId;
  if (opts.requisitionItemId != null) params.requisition_item_id = opts.requisitionItemId;
  if (opts.candidateId != null) params.candidate_id = opts.candidateId;
  if (opts.currentStage?.trim()) params.current_stage = opts.currentStage.trim();
  const { data } = await apiClient.get<PaginatedEnvelope<ApplicationRecord>>(
    "/applications",
    { params, signal: opts.signal },
  );
  const items = data?.data?.items ?? [];
  const pagination = data?.data?.pagination ?? {
    page: opts.page,
    limit: opts.limit,
    total: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  return { items, pagination };
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

export async function sendShortlistEmail(applicationId: number): Promise<{
  enqueued: boolean;
  skipped: boolean;
  notification_event_id: number | null;
  message?: string;
  real_email?: boolean;
  hint?: string | null;
}> {
  const { data } = await apiClient.post<{
    enqueued?: boolean;
    skipped?: boolean;
    notification_event_id?: number | null;
    message?: string;
    real_email?: boolean;
    hint?: string | null;
  }>(`/applications/${applicationId}/send-shortlist-email`, {});
  return {
    enqueued: Boolean(data.enqueued),
    skipped: Boolean(data.skipped),
    notification_event_id: data.notification_event_id ?? null,
    message: data.message,
    real_email: data.real_email,
    hint: data.hint ?? null,
  };
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

/**
 * Canonical paginated reader for /api/interviews. Returns
 * `PaginatedData<Interview>` from the canonical envelope.
 */
export async function fetchInterviewsPage(args: {
  page: number;
  limit: PageSizeType;
  candidateId?: number;
  requisitionId?: number;
  signal?: AbortSignal;
}): Promise<PaginatedData<Interview>> {
  const params: Record<string, string | number> = {
    page: args.page,
    limit: args.limit,
  };
  if (args.candidateId != null) params.candidate_id = args.candidateId;
  if (args.requisitionId != null) params.requisitionId = args.requisitionId;
  const { data } = await apiClient.get<PaginatedEnvelope<Interview>>(
    "/interviews/",
    { params, signal: args.signal },
  );
  if (!data.success || !data.data) {
    throw new Error((data.error as string | null) ?? "Failed to load interviews");
  }
  return data.data;
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

/** Canonical paginated reader for /api/manager/interviews. */
export async function fetchManagerInterviewsPage(args: {
  page: number;
  limit: PageSizeType;
  signal?: AbortSignal;
}): Promise<PaginatedData<Interview>> {
  const { data } = await apiClient.get<PaginatedEnvelope<Interview>>(
    "/manager/interviews",
    {
      params: { page: args.page, limit: args.limit },
      signal: args.signal,
    },
  );
  if (!data.success || !data.data) {
    throw new Error((data.error as string | null) ?? "Failed to load interviews");
  }
  return data.data;
}

/** Assigned interviews for users with the Interviewer role (panelist scope). */
export async function fetchMyInterviewerInterviews(): Promise<Interview[]> {
  const { data } = await apiClient.get<
    InterviewApiEnvelope<{ interviews: Interview[] }>
  >("/interviews/my");
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to load interviews");
  }
  return data.data.interviews;
}

/** Canonical paginated reader for /api/interviews/my. */
export async function fetchMyInterviewerInterviewsPage(args: {
  page: number;
  limit: PageSizeType;
  signal?: AbortSignal;
}): Promise<PaginatedData<Interview>> {
  const { data } = await apiClient.get<PaginatedEnvelope<Interview>>(
    "/interviews/my",
    {
      params: { page: args.page, limit: args.limit },
      signal: args.signal,
    },
  );
  if (!data.success || !data.data) {
    throw new Error((data.error as string | null) ?? "Failed to load interviews");
  }
  return data.data;
}

export type InterviewerRecommendation =
  | "strong_yes"
  | "yes"
  | "neutral"
  | "no"
  | "strong_no";

export type InterviewerInterviewDetailResponse = {
  interview: Interview;
  candidate_preview: {
    full_name: string;
    email: string;
    resume_path: string | null;
    candidate_skills: string[] | null;
    total_experience_years: string | null;
    education_raw: string | null;
  };
  my_panelist: InterviewPanelist;
  my_scorecard: {
    id: number;
    scores: unknown;
    notes: string | null;
    submitted_at: string;
  } | null;
};

/** GET /api/interviews/:id when caller is Interviewer (panelist); staff callers receive `{ interview }` only. */
export async function fetchInterviewerInterviewDetail(
  interviewId: number,
): Promise<InterviewerInterviewDetailResponse> {
  const { data } = await apiClient.get<
    InterviewApiEnvelope<InterviewerInterviewDetailResponse>
  >(`/interviews/${interviewId}`);
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to load interview");
  }
  return data.data;
}

export async function submitInterviewerFeedback(
  interviewId: number,
  payload: {
    recommendation: InterviewerRecommendation;
    strengths?: string | null;
    weaknesses?: string | null;
    notes?: string | null;
  },
): Promise<{
  scorecard: {
    id: number;
    scores: unknown;
    notes: string | null;
    submitted_at: string;
  };
}> {
  const { data } = await apiClient.post<
    InterviewApiEnvelope<{
      scorecard: {
        id: number;
        scores: unknown;
        notes: string | null;
        submitted_at: string;
      };
    }>
  >(`/interviews/${interviewId}/feedback`, payload);
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to submit feedback");
  }
  return data.data;
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

export async function generateInterviewMeetLink(payload: {
  scheduled_at: string;
  end_time: string;
  timezone: string;
  round_name?: string;
  round_type?: string;
  candidate_name?: string;
  interviewer_names?: string[];
}): Promise<{
  meeting_link: string;
  google_calendar_event_id: string | null;
  token_source: "user" | "org";
}> {
  const { data } = await apiClient.post<
    InterviewApiEnvelope<{
      meeting_link: string;
      google_calendar_event_id: string | null;
      token_source: "user" | "org";
    }>
  >("/interviews/generate-meet-link", payload);
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to generate Google Meet link");
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
// INTERVIEW LIFECYCLE
// ============================================================================

export type LifecycleRoundStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rescheduled";

export type LifecycleResult = "pending" | "passed" | "failed" | "hold";

export type LifecycleColor =
  | "grey"
  | "blue"
  | "yellow"
  | "green"
  | "red"
  | "orange";

export type LifecycleStageState = "not_started" | "current" | "past" | "rejected";

export interface LifecycleRound {
  interview_id: number;
  round_number: number;
  round_name: string | null;
  round_type: string | null;
  status: LifecycleRoundStatus;
  result: LifecycleResult;
  color: LifecycleColor;
  scheduled_at: string | null;
  end_time: string | null;
  meeting_link: string | null;
  location: string | null;
  feedback: string | null;
}

export interface LifecycleStage {
  key: "Sourced" | "Shortlisted" | "Interviewing" | "Offered" | "Hired";
  label: string;
  state: LifecycleStageState;
  color: LifecycleColor;
  rounds?: LifecycleRound[];
}

export interface LifecyclePayload {
  application_id: number;
  candidate_id: number;
  current_stage: string;
  is_rejected: boolean;
  top_level: LifecycleStage[];
  can_schedule_next: boolean;
  next_round_number: number;
}

export type RequisitionWorkspaceRecruiterFacet = { id: number; name: string };

export interface RequisitionWorkspaceCandidateRow {
  application_id: number;
  candidate_id: number;
  requisition_item_id: number;
  role_label: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  current_stage: string;
  source: string;
  created_at: string | null;
  recruiter: RequisitionWorkspaceRecruiterFacet | null;
  experience: { years: number | null; cie_level: string | null };
  lifecycle: LifecyclePayload;
}

/** Inner data shape of the canonical paginated workspace envelope. */
export interface RequisitionCandidatesWorkspaceData {
  items: RequisitionWorkspaceCandidateRow[];
  pagination: import("@/lib/pagination/contract").PaginationMeta;
  facets: {
    stages: string[];
    sources: string[];
    recruiters: RequisitionWorkspaceRecruiterFacet[];
  };
}

export async function fetchRequisitionCandidatesWorkspace(
  requisitionId: number,
  params: {
    page?: number;
    /** Canonical page size (25 / 50 / 100). */
    limit?: PageSizeType;
    q?: string;
    requisition_item_id?: number;
    current_stage?: string;
    source?: string;
    created_by?: number;
    applied_from?: string;
    applied_to?: string;
    exp_min?: number;
    exp_max?: number;
    include_unknown_exp?: boolean;
    interview_status?: string;
    signal?: AbortSignal;
  },
): Promise<RequisitionCandidatesWorkspaceData> {
  const { data } = await apiClient.get<{
    success: boolean;
    data: RequisitionCandidatesWorkspaceData;
    error: string | null;
  }>(
    `/requisitions/${requisitionId}/candidates-workspace`,
    {
      signal: params.signal,
      params: {
        page: params.page,
        limit: params.limit,
        q: params.q,
        requisition_item_id: params.requisition_item_id,
        current_stage: params.current_stage,
        source: params.source,
        created_by: params.created_by,
        applied_from: params.applied_from,
        applied_to: params.applied_to,
        exp_min: params.exp_min,
        exp_max: params.exp_max,
        include_unknown_exp:
          params.include_unknown_exp === true ? "true" : undefined,
        interview_status: params.interview_status,
      },
    },
  );
  return data?.data;
}

export interface ScheduleNextRoundPayload {
  application_id: number;
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

export async function fetchApplicationLifecycle(
  applicationId: number,
): Promise<LifecyclePayload> {
  const { data } = await apiClient.get<InterviewApiEnvelope<LifecyclePayload>>(
    `/applications/${applicationId}/lifecycle`,
  );
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to load interview lifecycle");
  }
  return data.data;
}

export async function submitInterviewResultApi(
  interviewId: number,
  result: Exclude<LifecycleResult, "pending">,
): Promise<LifecyclePayload> {
  const { data } = await apiClient.post<InterviewApiEnvelope<LifecyclePayload>>(
    `/interviews/${interviewId}/result`,
    { result },
  );
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to submit interview result");
  }
  return data.data;
}

export async function scheduleNextRoundApi(
  payload: ScheduleNextRoundPayload,
): Promise<InterviewMutationResult> {
  const { data } = await apiClient.post<
    InterviewApiEnvelope<InterviewMutationResult>
  >("/interviews/schedule-next", payload);
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to schedule next round");
  }
  return data.data;
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

export type BulkResumeUploadStartResult = {
  operationId: string;
  accepted_files: number;
  rejected_files: number;
};

export type BulkResumeStatusResult = {
  operationId: string;
  kind: string;
  status: string;
  total: number;
  processed: number;
  progress: number;
  success_count: number;
  failure_count: number;
  skipped_count: number;
  created_count?: number;
  failed_count?: number;
  failures: Array<{ file_name?: string; reason?: string }>;
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function startBulkResumeUpload(params: {
  requisition_item_id: number;
  files: File[];
  duplicate_policy?: "skip" | "update" | "application_only";
}): Promise<BulkResumeUploadStartResult> {
  const formData = new FormData();
  formData.append("requisition_item_id", String(params.requisition_item_id));
  formData.append("duplicate_policy", params.duplicate_policy ?? "skip");
  for (const f of params.files) {
    formData.append("files", f);
  }
  const { data } = await apiClient.post<{
    success: boolean;
    data: BulkResumeUploadStartResult | null;
    error: string | null;
  }>("/candidates/bulk-upload", formData);
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to start bulk upload");
  }
  return data.data;
}

export async function getBulkResumeStatus(
  operationId: string,
): Promise<BulkResumeStatusResult> {
  const { data } = await apiClient.get<{
    success: boolean;
    data: BulkResumeStatusResult | null;
    error: string | null;
  }>(`/bulk-import/${operationId}/status`);
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to load bulk status");
  }
  return data.data;
}

export async function retryFailedBulkResumeUpload(operationId: string): Promise<{
  operationId: string;
  retried_files: number;
}> {
  const { data } = await apiClient.post<{
    success: boolean;
    data: { operationId: string; retried_files: number } | null;
    error: string | null;
  }>(`/bulk-import/${operationId}/retry-failed`);
  if (!data.success || !data.data) {
    throw new Error(data.error ?? "Failed to retry failed resumes");
  }
  return data.data;
}
