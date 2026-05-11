/**
 * Recruiter performance computation.
 *
 * Derives `avgResponseHours` from the time between application creation
 * and the first stage transition recorded in `application_stage_history`.
 * Removes the Phase 1 hardcoded `24h` placeholder.
 */

import { groupBy } from "@/lib/analytics/aggregations/group";
import type { ApplicationAnalyticsBundle } from "@/lib/analytics/aggregations/load-application-bundle";
import { diffHours } from "@/lib/analytics/utils/dates";
import { average, pct } from "@/lib/analytics/utils/math";
import type { RecruiterPerformanceRow } from "@/lib/reports/types";

export function computeRecruiterPerformance(
  bundle: ApplicationAnalyticsBundle,
): RecruiterPerformanceRow[] {
  const { applications, historyByApplication, stageContext } = bundle;
  const grouped = groupBy(applications, (a) => a.createdBy ?? -1);
  const rows: RecruiterPerformanceRow[] = [];
  grouped.forEach((apps, recruiterKey) => {
    const responseHours: number[] = [];
    let hires = 0;
    for (const app of apps) {
      const key = stageContext.mapToStageKey(app.currentStage);
      if (key && stageContext.hireKeys.has(key)) hires += 1;
      const list = historyByApplication.get(app.applicationId);
      const firstTransition = list && list.length > 0 ? list[list.length - 1] : null;
      if (firstTransition?.changedAt) {
        responseHours.push(diffHours(firstTransition.changedAt, app.createdAt));
      }
    }
    const requisitions = new Set(apps.map((v) => v.requisitionId));
    rows.push({
      recruiterId: recruiterKey === -1 ? null : recruiterKey,
      recruiter: apps[0]?.recruiterName ?? "Deleted recruiter",
      candidatesProcessed: apps.length,
      avgResponseHours: average(responseHours),
      hiresMade: hires,
      conversionPct: pct(hires, apps.length),
      activeRequisitions: requisitions.size,
    });
  });
  rows.sort((a, b) => b.candidatesProcessed - a.candidatesProcessed);
  return rows;
}
