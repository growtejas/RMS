/**
 * Source effectiveness computation.
 *
 * Quality score blends conversion (hire rate) and engagement
 * (interview rate) so high-volume but low-quality sources don't
 * dominate the leaderboard.
 */

import { groupBy } from "@/lib/analytics/aggregations/group";
import type { ApplicationAnalyticsBundle } from "@/lib/analytics/aggregations/load-application-bundle";
import { pct, roundTo } from "@/lib/analytics/utils/math";
import type { ReportInterviewRow } from "@/lib/repositories/reports-repo";
import type { SourceEffectivenessRow } from "@/lib/reports/types";

export function computeSourceEffectiveness(
  bundle: ApplicationAnalyticsBundle,
  interviews: ReportInterviewRow[],
): SourceEffectivenessRow[] {
  const { applications, stageContext } = bundle;
  const interviewsByApplication = new Set<number>();
  for (const iv of interviews) {
    if (iv.applicationId != null) interviewsByApplication.add(iv.applicationId);
  }
  const grouped = groupBy(applications, (a) => (a.source ?? "unknown").trim() || "unknown");
  const rows: SourceEffectivenessRow[] = [];
  grouped.forEach((apps, source) => {
    const interviewCount = apps.filter((a) => interviewsByApplication.has(a.applicationId)).length;
    const hires = apps.filter((a) => {
      const key = stageContext.mapToStageKey(a.currentStage);
      return key != null && stageContext.hireKeys.has(key);
    }).length;
    const conversionPct = pct(hires, apps.length);
    const interviewPct = pct(interviewCount, apps.length);
    rows.push({
      source,
      applications: apps.length,
      interviews: interviewCount,
      hires,
      qualityScore: roundTo(conversionPct * 0.7 + interviewPct * 0.3, 2),
      conversionPct,
    });
  });
  rows.sort((a, b) => b.qualityScore - a.qualityScore);
  return rows;
}
