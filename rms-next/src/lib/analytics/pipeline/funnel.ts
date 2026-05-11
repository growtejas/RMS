/**
 * Candidate lifecycle funnel computation.
 *
 * Single-pass aggregation over the pre-loaded application bundle.
 * All metrics are deterministic - no Math.random or placeholder values.
 */

import {
  countBy,
  incrementMap,
} from "@/lib/analytics/aggregations/group";
import type { ApplicationAnalyticsBundle } from "@/lib/analytics/aggregations/load-application-bundle";
import {
  buildFunnelRows,
  type FunnelStageInputs,
} from "@/lib/analytics/transformers/funnel";
import { diffDays, lastNDayBuckets } from "@/lib/analytics/utils/dates";
import { average, pct, roundTo } from "@/lib/analytics/utils/math";
import type { AnalyticsFilters } from "@/lib/analytics/utils/scope";
import type {
  CandidateDrillDownRow,
  FunnelStageAnalytics,
  HiringIntelligenceKpis,
} from "@/lib/reports/types";

const FUNNEL_AGING_WARNING_DAYS = 14;
const SPARKLINE_DAYS = 14;

export interface PipelineFunnelComputation {
  stages: FunnelStageAnalytics[];
  kpis: HiringIntelligenceKpis;
  drillDown: {
    rows: CandidateDrillDownRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number } | null;
  };
}

export interface PipelineFunnelOptions {
  /** Stage key to drill down into (canonical). */
  drillStageKey?: string | null;
}

export function computePipelineFunnel(
  bundle: ApplicationAnalyticsBundle,
  filters: AnalyticsFilters,
  options: PipelineFunnelOptions = {},
): PipelineFunnelComputation {
  const { applications, history, historyByApplication, stageContext, hiredAtByApplication } =
    bundle;

  // Single pass: bucket counts, aging, and rejection accumulation.
  const stageInputs = new Map<string, FunnelStageInputs>();
  for (const app of applications) {
    const key = stageContext.mapToStageKey(app.currentStage);
    if (!key) continue;
    const inputs = stageInputs.get(key) ?? {
      count: 0,
      agingDays: [],
      rejectionCount: 0,
      rejectionReasons: new Map<string, number>(),
    };
    inputs.count += 1;
    const lastMove =
      historyByApplication.get(app.applicationId)?.[0]?.changedAt ?? app.createdAt;
    inputs.agingDays.push(diffDays(new Date(), lastMove ?? new Date()));
    stageInputs.set(key, inputs);
  }
  for (const h of history) {
    const toKey = stageContext.mapToStageKey(h.toStage);
    if (!toKey) continue;
    if (stageContext.rejectionKeys.has(toKey)) {
      const fromKey = stageContext.mapToStageKey(h.fromStage) ?? toKey;
      const inputs = stageInputs.get(fromKey) ?? {
        count: 0,
        agingDays: [],
        rejectionCount: 0,
        rejectionReasons: new Map<string, number>(),
      };
      inputs.rejectionCount += 1;
      const reason = h.reason?.trim();
      if (reason) incrementMap(inputs.rejectionReasons, reason);
      stageInputs.set(fromKey, inputs);
    }
  }

  const stages = buildFunnelRows(stageContext.all, stageInputs, {
    agingWarningDays: FUNNEL_AGING_WARNING_DAYS,
  });

  const totalApplications = applications.length;
  const hires = stages
    .filter((s) => stageContext.hireKeys.has(s.key))
    .reduce((sum, s) => sum + s.count, 0);
  const offerKeys = stageContext.all
    .filter((s) => /offer/i.test(s.key) || /offer/i.test(s.label))
    .map((s) => s.key);
  const offers = offerKeys.length
    ? stages.filter((s) => offerKeys.includes(s.key)).reduce((sum, s) => sum + s.count, 0)
    : 0;
  const interviewStageKeys = new Set(
    stageContext.active
      .filter((s) => !/applied|screen/i.test(s.key) && !/applied|screen/i.test(s.label))
      .map((s) => s.key),
  );
  const totalInterviews = applications.filter((a) => {
    const key = stageContext.mapToStageKey(a.currentStage);
    return key != null && interviewStageKeys.has(key);
  }).length;
  const activeJobs = new Set(
    applications
      .filter((a) => (a.itemStatus ?? "").toLowerCase() !== "closed")
      .map((a) => a.requisitionItemId),
  ).size;

  const tthDurations: number[] = [];
  for (const app of applications) {
    const hiredAt = hiredAtByApplication.get(app.applicationId);
    if (hiredAt) tthDurations.push(diffDays(hiredAt, app.createdAt));
  }
  const avgTimeToHireDays = average(tthDurations);

  const noShowCount = history.filter((h) =>
    (h.reason ?? "").toLowerCase().includes("no show"),
  ).length;

  const sparklineDays = lastNDayBuckets(SPARKLINE_DAYS);
  const appsByDay = countBy(applications, (a) => {
    const d = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt as unknown as string);
    return d.toISOString().slice(0, 10);
  });
  const hiresByDay = new Map<string, number>();
  hiredAtByApplication.forEach((ts) => {
    incrementMap(hiresByDay, ts.toISOString().slice(0, 10));
  });
  const sparkline = {
    applications: sparklineDays.map((b) => ({ ts: b.start.toISOString(), value: appsByDay.get(b.key) ?? 0 })),
    hires: sparklineDays.map((b) => ({ ts: b.start.toISOString(), value: hiresByDay.get(b.key) ?? 0 })),
  };

  const kpis: HiringIntelligenceKpis = {
    totalApplications,
    totalInterviews,
    hires,
    offerAcceptanceRate: pct(hires, offers),
    avgTimeToHireDays,
    pipelineConversionPct: pct(hires, totalApplications),
    interviewNoShowPct: pct(noShowCount, totalInterviews),
    activeJobs,
    sparkline,
  };

  const drillDown = options.drillStageKey
    ? buildDrillDown(bundle, options.drillStageKey, filters)
    : { rows: [], pagination: null };

  return { stages, kpis, drillDown };
}

function buildDrillDown(
  bundle: ApplicationAnalyticsBundle,
  drillStageKey: string,
  filters: AnalyticsFilters,
): {
  rows: CandidateDrillDownRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number } | null;
} {
  const { applications, historyByApplication, stageContext, maxScoreByCandidate } = bundle;
  const stageDef = stageContext.all.find((s) => s.key === drillStageKey);
  const matching = applications.filter(
    (a) => stageContext.mapToStageKey(a.currentStage) === drillStageKey,
  );
  const filtered = filters.search
    ? matching.filter((a) => {
        const haystack = `${a.candidateName ?? ""} ${a.candidateEmail ?? ""} ${a.rolePosition ?? ""}`.toLowerCase();
        return haystack.includes(filters.search.toLowerCase());
      })
    : matching;
  const total = filtered.length;
  const page = Math.max(1, filters.page);
  const limit = Math.max(1, filters.limit);
  const start = (page - 1) * limit;
  const paged = filtered.slice(start, start + limit);
  const rows: CandidateDrillDownRow[] = paged.map((a) => {
    const latestHistory = historyByApplication.get(a.applicationId)?.[0];
    const stageAgingDays = roundTo(diffDays(new Date(), latestHistory?.changedAt ?? a.createdAt), 1);
    return {
      applicationId: a.applicationId,
      candidateId: a.candidateId,
      candidateName: a.candidateName ?? `Candidate #${a.candidateId}`,
      recruiter: a.recruiterName ?? null,
      recruiterId: a.createdBy ?? null,
      stageAgingDays,
      rejectionReason: latestHistory?.reason ?? null,
      interviewScore: maxScoreByCandidate.get(a.candidateId) ?? null,
      timelineSummary: `${stageDef?.label ?? drillStageKey} for ${a.rolePosition ?? "Open role"}`,
      stageKey: drillStageKey,
      stageLabel: stageDef?.label ?? drillStageKey,
      rolePosition: a.rolePosition ?? null,
    };
  });
  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
