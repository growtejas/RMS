/**
 * Time-to-hire computation.
 *
 * Removes the Phase 1 duplicate `fetchApplicationsForReport` call (the
 * old service code accidentally fetched applications twice when computing
 * stage history). Now operates on the pre-loaded bundle and emits a
 * deterministic stage aging heatmap derived from
 * `application_stage_history` rather than `Math.random()` values.
 */

import type { ApplicationAnalyticsBundle } from "@/lib/analytics/aggregations/load-application-bundle";
import { diffDays, lastNMonthBuckets } from "@/lib/analytics/utils/dates";
import { average, percentile, roundTo } from "@/lib/analytics/utils/math";
import type {
  TimeToHireResponse,
  TimeToHireTrendPoint,
} from "@/lib/reports/types";

export interface TimeToHireComputation {
  avgDaysFromApplicationToHire: TimeToHireResponse["avgDaysFromApplicationToHire"];
  trend: TimeToHireTrendPoint[];
  byDepartment: TimeToHireResponse["byDepartment"];
  stageAgingHeatmap: TimeToHireResponse["stageAgingHeatmap"];
}

export function computeTimeToHire(bundle: ApplicationAnalyticsBundle): TimeToHireComputation {
  const { applications, hiredAtByApplication, requisitionMeta, stageContext, historyByApplication } =
    bundle;
  const durations: number[] = [];
  const departmentDurations = new Map<string, number[]>();

  for (const app of applications) {
    const hiredAt = hiredAtByApplication.get(app.applicationId);
    if (!hiredAt) continue;
    const days = diffDays(hiredAt, app.createdAt);
    durations.push(days);
    const dept = requisitionMeta.get(app.requisitionId)?.projectName ?? "Unknown";
    const arr = departmentDurations.get(dept) ?? [];
    arr.push(days);
    departmentDurations.set(dept, arr);
  }

  const avgDaysFromApplicationToHire = average(durations);

  const monthBuckets = lastNMonthBuckets(12);
  const trend: TimeToHireTrendPoint[] = monthBuckets.map((bucket) => {
    const monthDurations: number[] = [];
    for (const app of applications) {
      const hiredAt = hiredAtByApplication.get(app.applicationId);
      if (!hiredAt) continue;
      if (hiredAt < bucket.start || hiredAt >= bucket.end) continue;
      monthDurations.push(diffDays(hiredAt, app.createdAt));
    }
    return {
      date: bucket.start.toISOString(),
      avgDays: average(monthDurations),
      hires: monthDurations.length,
    };
  });

  const byDepartment = Array.from(departmentDurations.entries())
    .map(([department, values]) => ({
      department,
      avgDays: average(values),
      hires: values.length,
    }))
    .sort((a, b) => b.hires - a.hires);

  // Stage aging heatmap: P50 dwell time per active stage, computed from
  // (next change | now) - changedAt for each transition into the stage.
  const stageDwell = new Map<string, number[]>();
  historyByApplication.forEach((history) => {
    const sorted = history
      .slice()
      .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
    for (let i = 0; i < sorted.length; i += 1) {
      const entry = sorted[i];
      const stageKey = stageContext.mapToStageKey(entry.toStage);
      if (!stageKey) continue;
      const nextTime = sorted[i + 1]?.changedAt ?? new Date();
      const dwell = diffDays(nextTime, entry.changedAt);
      const arr = stageDwell.get(stageKey) ?? [];
      arr.push(dwell);
      stageDwell.set(stageKey, arr);
    }
  });
  const stageAgingHeatmap = stageContext.active.map((stage) => ({
    stage: stage.label,
    bucket: "P50",
    avgDays: roundTo(percentile(stageDwell.get(stage.key) ?? [], 0.5), 2),
  }));

  return {
    avgDaysFromApplicationToHire,
    trend,
    byDepartment,
    stageAgingHeatmap,
  };
}
