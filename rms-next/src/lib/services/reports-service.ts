/**
 * Thin orchestration layer for report API routes.
 *
 * All computation lives in `@/lib/analytics/*`. This file builds the
 * `AnalyticsScope`, loads the shared application bundle (when needed),
 * delegates to the relevant compute function, and decorates the response
 * with freshness metadata and HTTP envelope payloads.
 */

import {
  computeInterviewFunnel,
  computeInterviewerPerformance,
  computePipelineFunnel,
  computeRecruiterPerformance,
  computeSourceEffectiveness,
  computeTimeToHire,
  loadApplicationAnalyticsBundle,
  narrowFiltersByTarget,
  type AnalyticsScope,
} from "@/lib/analytics";
import {
  fetchInterviewScorecards,
  fetchInterviewsForReport,
} from "@/lib/repositories/reports-repo";
import type {
  InterviewFunnelResponse,
  InterviewerPerformanceResponse,
  PipelineFunnelResponse,
  RecruiterPerformanceResponse,
  ReportFilters,
  ReportFreshness,
  SourceEffectivenessResponse,
  TimeToHireResponse,
} from "@/lib/reports/types";

function buildScope(organizationId: string, filters: ReportFilters): AnalyticsScope {
  return {
    organizationId,
    target: { kind: "organization" },
    filters,
  };
}

function liveFreshness(start: number): ReportFreshness {
  return {
    generatedAt: new Date().toISOString(),
    source: "live",
    ageMs: null,
    computeMs: Math.round(performance.now() - start),
  };
}

export async function getPipelineFunnelReport(
  organizationId: string,
  filters: ReportFilters,
  drillStageKey?: string | null,
): Promise<PipelineFunnelResponse> {
  const start = performance.now();
  const scope = buildScope(organizationId, filters);
  const bundle = await loadApplicationAnalyticsBundle(
    scope.organizationId,
    narrowFiltersByTarget(scope),
  );
  const computation = computePipelineFunnel(bundle, filters, { drillStageKey: drillStageKey ?? null });
  return {
    kpis: computation.kpis,
    stages: computation.stages,
    pagination: computation.drillDown.pagination,
    drillDownRows: computation.drillDown.rows,
    freshness: liveFreshness(start),
  };
}

export async function getInterviewFunnelReport(
  organizationId: string,
  filters: ReportFilters,
): Promise<InterviewFunnelResponse> {
  const start = performance.now();
  const interviews = await fetchInterviewsForReport(organizationId, filters);
  const scorecards = await fetchInterviewScorecards(interviews.map((i) => i.interviewId));
  const computation = computeInterviewFunnel(interviews, scorecards);
  return {
    stages: computation.stages,
    bottlenecks: computation.bottlenecks,
    freshness: liveFreshness(start),
  };
}

export async function getTimeToHireReport(
  organizationId: string,
  filters: ReportFilters,
): Promise<TimeToHireResponse> {
  const start = performance.now();
  const scope = buildScope(organizationId, filters);
  const bundle = await loadApplicationAnalyticsBundle(
    scope.organizationId,
    narrowFiltersByTarget(scope),
  );
  const computation = computeTimeToHire(bundle);
  return {
    avgDaysFromApplicationToHire: computation.avgDaysFromApplicationToHire,
    trend: computation.trend,
    byDepartment: computation.byDepartment,
    stageAgingHeatmap: computation.stageAgingHeatmap,
    freshness: liveFreshness(start),
  };
}

export async function getSourceEffectivenessReport(
  organizationId: string,
  filters: ReportFilters,
): Promise<SourceEffectivenessResponse> {
  const start = performance.now();
  const scope = buildScope(organizationId, filters);
  const bundle = await loadApplicationAnalyticsBundle(
    scope.organizationId,
    narrowFiltersByTarget(scope),
  );
  const interviews = await fetchInterviewsForReport(organizationId, filters);
  return {
    rows: computeSourceEffectiveness(bundle, interviews),
    freshness: liveFreshness(start),
  };
}

export async function getRecruiterPerformanceReport(
  organizationId: string,
  filters: ReportFilters,
): Promise<RecruiterPerformanceResponse> {
  const start = performance.now();
  const scope = buildScope(organizationId, filters);
  const bundle = await loadApplicationAnalyticsBundle(
    scope.organizationId,
    narrowFiltersByTarget(scope),
  );
  return {
    rows: computeRecruiterPerformance(bundle),
    freshness: liveFreshness(start),
  };
}

export async function getInterviewerPerformanceReport(
  organizationId: string,
  filters: ReportFilters,
): Promise<InterviewerPerformanceResponse> {
  const start = performance.now();
  const interviews = await fetchInterviewsForReport(organizationId, filters);
  const scorecards = await fetchInterviewScorecards(interviews.map((iv) => iv.interviewId));
  return {
    rows: computeInterviewerPerformance(interviews, scorecards),
    freshness: liveFreshness(start),
  };
}
