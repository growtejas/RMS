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

function hasHiredSignal(input: {
  currentStage: string | null | undefined;
  historyStageNames: Array<string | null | undefined>;
}): boolean {
  const hiredPattern = /\b(hired|joined|fulfilled)\b/i;
  const currentRaw = (input.currentStage ?? "").trim().toLowerCase();
  if (hiredPattern.test(currentRaw)) {
    return true;
  }
  for (const s of input.historyStageNames) {
    const raw = (s ?? "").trim().toLowerCase();
    if (!raw) continue;
    if (hiredPattern.test(raw)) {
      return true;
    }
  }
  return false;
}

function isCandidateHired(params: {
  currentStage: string | null | undefined;
  historyStageNames: Array<string | null | undefined>;
  mappedCurrentKey: string | null;
  hireKeys: Set<string>;
}): boolean {
  if (params.mappedCurrentKey && params.hireKeys.has(params.mappedCurrentKey)) return true;
  return hasHiredSignal({
    currentStage: params.currentStage,
    historyStageNames: params.historyStageNames,
  });
}

export function computePipelineFunnel(
  bundle: ApplicationAnalyticsBundle,
  filters: AnalyticsFilters,
  options: PipelineFunnelOptions = {},
): PipelineFunnelComputation {
  const { applications, history, historyByApplication, stageContext, hiredAtByApplication } =
    bundle;

  // Stage counts are cumulative progression counts (reached-stage),
  // not just current snapshot counts. This keeps funnel monotonic:
  // sourced >= shortlisted >= interviewing >= offered >= hired.
  const stageInputs = new Map<string, FunnelStageInputs>();
  const forwardOrdered = [...stageContext.all]
    .filter((s) => !s.isHidden && s.stageType !== "rejected" && s.stageType !== "withdrawn")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const forwardIndexByKey = new Map(forwardOrdered.map((s, i) => [s.key, i]));
  const hiredForwardIndex = (() => {
    const hireForwardKeys = new Set(
      forwardOrdered
        .filter((s) => stageContext.hireKeys.has(s.key))
        .map((s) => s.key),
    );
    for (const key of hireForwardKeys) {
      const idx = forwardIndexByKey.get(key);
      if (idx != null) return idx;
    }
    for (let i = forwardOrdered.length - 1; i >= 0; i -= 1) {
      const s = forwardOrdered[i];
      if (/hire|join|fulfill/i.test(s.key) || /hire|join|fulfill/i.test(s.label)) return i;
    }
    return -1;
  })();

  for (const app of applications) {
    const currentKey = stageContext.mapToStageKey(app.currentStage);
    const currentInputs = stageInputs.get(currentKey ?? "__none__") ?? {
      count: 0,
      agingDays: [],
      rejectionCount: 0,
      rejectionReasons: new Map<string, number>(),
    };

    // Determine the furthest active stage this candidate has reached.
    let maxActiveIndex = currentKey != null ? (forwardIndexByKey.get(currentKey) ?? -1) : -1;
    const appHistory = historyByApplication.get(app.applicationId) ?? [];
    for (const h of appHistory) {
      const toKey = stageContext.mapToStageKey(h.toStage);
      if (!toKey) continue;
      const idx = forwardIndexByKey.get(toKey);
      if (idx != null && idx > maxActiveIndex) maxActiveIndex = idx;
    }
    // Fallback for legacy/custom hired labels that fail canonical mapping.
    if (maxActiveIndex < hiredForwardIndex && hiredForwardIndex >= 0) {
      const hiredSignal = hasHiredSignal({
        currentStage: app.currentStage,
        historyStageNames: appHistory.flatMap((h) => [h.fromStage, h.toStage]),
      });
      if (hiredSignal) maxActiveIndex = hiredForwardIndex;
    }

    if (maxActiveIndex >= 0) {
      for (let i = 0; i <= maxActiveIndex; i += 1) {
        const key = forwardOrdered[i].key;
        const inputs = stageInputs.get(key) ?? {
          count: 0,
          agingDays: [],
          rejectionCount: 0,
          rejectionReasons: new Map<string, number>(),
        };
        inputs.count += 1;
        stageInputs.set(key, inputs);
      }
    }

    // Aging remains a current-stage signal.
    const lastMove =
      historyByApplication.get(app.applicationId)?.[0]?.changedAt ?? app.createdAt;
    if (currentKey) {
      currentInputs.agingDays.push(diffDays(new Date(), lastMove ?? new Date()));
      stageInputs.set(currentKey, currentInputs);
    }
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

  let stages = buildFunnelRows(stageContext.all, stageInputs, {
    agingWarningDays: FUNNEL_AGING_WARNING_DAYS,
  });
  const hiredExactCount = applications.filter((a) => {
    const appHistory = historyByApplication.get(a.applicationId) ?? [];
    const mappedCurrentKey = stageContext.mapToStageKey(a.currentStage);
    return isCandidateHired({
      currentStage: a.currentStage,
      historyStageNames: appHistory.flatMap((h) => [h.fromStage, h.toStage]),
      mappedCurrentKey,
      hireKeys: stageContext.hireKeys,
    });
  }).length;
  if (hiredExactCount >= 0) {
    stages = stages.map((s) =>
      stageContext.hireKeys.has(s.key)
        ? { ...s, count: hiredExactCount }
        : s,
    );
  }

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
  const forwardOrdered = [...stageContext.all]
    .filter((s) => !s.isHidden && s.stageType !== "rejected" && s.stageType !== "withdrawn")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const activeIndexByKey = new Map(forwardOrdered.map((s, i) => [s.key, i]));
  const targetIndex = activeIndexByKey.get(drillStageKey) ?? -1;
  const isHireDrill = stageContext.hireKeys.has(drillStageKey);
  const stageKeyNorm = drillStageKey.trim().toLowerCase();
  const stageLabelNorm = (stageDef?.label ?? "").trim().toLowerCase();
  const stageNeedles = new Set<string>(
    [stageKeyNorm, stageLabelNorm, stageKeyNorm.replace(/_/g, " "), stageLabelNorm.replace(/_/g, " ")]
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
  );

  const matching = applications.filter((a) => {
    // Explicit hired matching for legacy/custom final-stage names.
    if (isHireDrill) {
      const appHistory = historyByApplication.get(a.applicationId) ?? [];
      const currentKey = stageContext.mapToStageKey(a.currentStage);
      const hiredSignal = isCandidateHired({
        currentStage: a.currentStage,
        historyStageNames: appHistory.flatMap((h) => [h.fromStage, h.toStage]),
        mappedCurrentKey: currentKey,
        hireKeys: stageContext.hireKeys,
      });
      if (hiredSignal) return true;
      return false;
    }

    if (targetIndex < 0) {
      return stageContext.mapToStageKey(a.currentStage) === drillStageKey;
    }
    const currentKey = stageContext.mapToStageKey(a.currentStage);
    let maxActiveIndex = currentKey != null ? (activeIndexByKey.get(currentKey) ?? -1) : -1;
    const appHistory = historyByApplication.get(a.applicationId) ?? [];
    for (const h of appHistory) {
      const toKey = stageContext.mapToStageKey(h.toStage);
      if (!toKey) continue;
      const idx = activeIndexByKey.get(toKey);
      if (idx != null && idx > maxActiveIndex) maxActiveIndex = idx;
    }
    if (maxActiveIndex >= targetIndex) return true;

    // Fallback: when legacy/raw stage text doesn't map cleanly, match by stage key/label text.
    const currentRaw = (a.currentStage ?? "").trim().toLowerCase();
    for (const n of stageNeedles) {
      if (n && currentRaw.includes(n)) return true;
    }
    for (const h of appHistory) {
      const fromRaw = (h.fromStage ?? "").trim().toLowerCase();
      const toRaw = (h.toStage ?? "").trim().toLowerCase();
      for (const n of stageNeedles) {
        if (!n) continue;
        if (fromRaw.includes(n) || toRaw.includes(n)) return true;
      }
    }
    return false;
  });
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
