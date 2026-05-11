/**
 * Public analytics module surface.
 */

export {
  loadApplicationAnalyticsBundle,
  type ApplicationAnalyticsBundle,
} from "@/lib/analytics/aggregations/load-application-bundle";
export { computeInterviewFunnel } from "@/lib/analytics/interviews/funnel";
export { computeInterviewerPerformance } from "@/lib/analytics/interviews/performance";
export { computePipelineFunnel } from "@/lib/analytics/pipeline/funnel";
export {
  buildStageContext,
  getPipelineStageContext,
  PIPELINE_FALLBACK_STAGES,
  type PipelineStageContext,
} from "@/lib/analytics/pipeline/stages-service";
export { computeRecruiterPerformance } from "@/lib/analytics/recruiters/performance";
export { loadRequisitionScopeBundle } from "@/lib/analytics/requisitions/scope";
export { computeSourceEffectiveness } from "@/lib/analytics/sources/effectiveness";
export { computeTimeToHire } from "@/lib/analytics/time-to-hire/trend";
export {
  buildFunnelRows,
  type FunnelStageInputs,
  type FunnelStageRow,
  type StageDefinition,
  type StageType,
} from "@/lib/analytics/transformers/funnel";
export {
  buildScopeCacheKey,
  EMPTY_ANALYTICS_FILTERS,
  narrowFiltersByTarget,
  type AnalyticsFilters,
  type AnalyticsScope,
  type AnalyticsScopeTarget,
} from "@/lib/analytics/utils/scope";
