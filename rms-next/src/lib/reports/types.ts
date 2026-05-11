/**
 * Canonical report DTOs.
 *
 * Filter shape lives in `@/lib/analytics/utils/scope` (`AnalyticsFilters`).
 * `ReportFilters` is kept as a backwards-compatible alias for legacy imports.
 */

import type { AnalyticsFilters } from "@/lib/analytics/utils/scope";

export type ReportFilters = AnalyticsFilters;

export type ReportKpiPoint = {
  ts: string;
  value: number;
};

export type HiringIntelligenceKpis = {
  totalApplications: number;
  totalInterviews: number;
  hires: number;
  offerAcceptanceRate: number;
  avgTimeToHireDays: number;
  pipelineConversionPct: number;
  interviewNoShowPct: number;
  activeJobs: number;
  sparkline: Record<string, ReportKpiPoint[]>;
};

export type FunnelStageAnalytics = {
  /** Canonical stage key (matches `pipeline_stage_definitions.stage_key`). */
  key: string;
  /** Human-readable stage label rendered by the UI. */
  stage: string;
  count: number;
  conversionPct: number;
  dropOffPct: number;
  avgDaysInStage: number;
  rejectionCount: number;
  topRejectionReason: string | null;
  isTerminal: boolean;
  stageType: "active" | "rejected" | "withdrawn" | "terminal";
  agingWarning: boolean;
};

export type CandidateDrillDownRow = {
  applicationId: number;
  candidateId: number;
  candidateName: string;
  recruiter: string | null;
  recruiterId: number | null;
  stageAgingDays: number;
  rejectionReason: string | null;
  interviewScore: number | null;
  timelineSummary: string;
  stageKey: string;
  stageLabel: string;
  rolePosition: string | null;
};

export type ReportFreshness = {
  /** ISO timestamp of when the response payload was generated. */
  generatedAt: string;
  /** Source of truth for the values. `live` = always-fresh repository read. */
  source: "live" | "snapshot";
  /** Optional snapshot age (ms). Null for live results. */
  ageMs: number | null;
  /** Compute time on the server in ms (best-effort, used for slow-query alerts). */
  computeMs: number;
};

export type PipelineFunnelResponse = {
  kpis: HiringIntelligenceKpis;
  stages: FunnelStageAnalytics[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null;
  drillDownRows: CandidateDrillDownRow[];
  freshness: ReportFreshness;
};

export type InterviewFunnelStage = {
  key: string;
  stage: string;
  count: number;
  passRatePct: number;
  completionRatioPct: number;
  noShowPct: number;
  avgFeedbackTurnaroundHours: number;
};

export type InterviewFunnelResponse = {
  stages: InterviewFunnelStage[];
  bottlenecks: Array<{ stage: string; delayedCount: number; warning: string }>;
  freshness: ReportFreshness;
};

export type TimeToHireTrendPoint = {
  date: string;
  avgDays: number;
  hires: number;
};

export type TimeToHireResponse = {
  avgDaysFromApplicationToHire: number;
  trend: TimeToHireTrendPoint[];
  byDepartment: Array<{ department: string; avgDays: number; hires: number }>;
  stageAgingHeatmap: Array<{ stage: string; bucket: string; avgDays: number }>;
  freshness: ReportFreshness;
};

export type SourceEffectivenessRow = {
  source: string;
  applications: number;
  interviews: number;
  hires: number;
  qualityScore: number;
  conversionPct: number;
};

export type SourceEffectivenessResponse = {
  rows: SourceEffectivenessRow[];
  freshness: ReportFreshness;
};

export type RecruiterPerformanceRow = {
  recruiterId: number | null;
  recruiter: string;
  candidatesProcessed: number;
  avgResponseHours: number;
  hiresMade: number;
  conversionPct: number;
  activeRequisitions: number;
};

export type RecruiterPerformanceResponse = {
  rows: RecruiterPerformanceRow[];
  freshness: ReportFreshness;
};

export type InterviewerPerformanceRow = {
  interviewerId: number | null;
  interviewer: string;
  interviewsConducted: number;
  passRatioPct: number;
  avgCandidateRating: number;
  avgFeedbackSubmissionHours: number;
  overdueFeedbackCount: number;
};

export type InterviewerPerformanceResponse = {
  rows: InterviewerPerformanceRow[];
  freshness: ReportFreshness;
};
