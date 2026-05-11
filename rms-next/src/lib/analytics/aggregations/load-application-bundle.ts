/**
 * Single-source bundle loader for application-centric reports.
 *
 * Phase 1 had multiple endpoints separately fetching applications, history,
 * and scores. The bundle loader consolidates those reads so a single
 * service call computes its inputs once. Used by candidate funnel,
 * time-to-hire, source effectiveness and recruiter performance services.
 */

import { groupBy, indexBy } from "@/lib/analytics/aggregations/group";
import { getPipelineStageContext, type PipelineStageContext } from "@/lib/analytics/pipeline/stages-service";
import {
  fetchApplicationStageHistory,
  fetchApplicationsForReport,
  fetchInterviewScoresByCandidate,
  fetchRequisitionDepartmentMap,
  type ReportApplicationRow,
  type ReportStageHistoryRow,
} from "@/lib/repositories/reports-repo";
import type { AnalyticsFilters } from "@/lib/analytics/utils/scope";

export interface ApplicationAnalyticsBundle {
  applications: ReportApplicationRow[];
  history: ReportStageHistoryRow[];
  /** Stage history grouped per application (most-recent first). */
  historyByApplication: Map<number, ReportStageHistoryRow[]>;
  /** First time we observed transition to a hired-type stage, per applicationId. */
  hiredAtByApplication: Map<number, Date>;
  /** Max candidate score (used for drilldown preview). */
  maxScoreByCandidate: Map<number, number>;
  stageContext: PipelineStageContext;
  /** Department/location/workmode lookup keyed by requisitionId. */
  requisitionMeta: Map<number, {
    reqId: number;
    projectName: string | null;
    clientName: string | null;
    workMode: string | null;
    officeLocation: string | null;
  }>;
}

export async function loadApplicationAnalyticsBundle(
  organizationId: string,
  filters: AnalyticsFilters,
): Promise<ApplicationAnalyticsBundle> {
  const [stageContext, applicationsRows, requisitionRows] = await Promise.all([
    getPipelineStageContext(organizationId),
    fetchApplicationsForReport(organizationId, filters),
    fetchRequisitionDepartmentMap(organizationId),
  ]);
  const applicationIds = applicationsRows.map((a) => a.applicationId);
  const candidateIds = applicationsRows.map((a) => a.candidateId);
  const [history, scores] = await Promise.all([
    fetchApplicationStageHistory(applicationIds),
    fetchInterviewScoresByCandidate(candidateIds),
  ]);

  const historyByApplication = groupBy(history, (h) => h.applicationId);
  const maxScoreByCandidate = new Map<number, number>();
  for (const row of scores) {
    const value = Number(row.score ?? 0);
    if (!Number.isFinite(value)) continue;
    const prev = maxScoreByCandidate.get(row.candidateId);
    maxScoreByCandidate.set(row.candidateId, prev == null ? value : Math.max(prev, value));
  }

  const hiredAtByApplication = new Map<number, Date>();
  for (const row of history) {
    const key = stageContext.mapToStageKey(row.toStage);
    if (!key) continue;
    if (stageContext.hireKeys.has(key)) {
      const ts = row.changedAt instanceof Date ? row.changedAt : new Date(row.changedAt as unknown as string);
      const existing = hiredAtByApplication.get(row.applicationId);
      if (!existing || ts < existing) {
        hiredAtByApplication.set(row.applicationId, ts);
      }
    }
  }

  return {
    applications: applicationsRows,
    history,
    historyByApplication,
    hiredAtByApplication,
    maxScoreByCandidate,
    stageContext,
    requisitionMeta: indexBy(requisitionRows, (r) => r.reqId),
  };
}
