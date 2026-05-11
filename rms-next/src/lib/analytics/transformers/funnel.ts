/**
 * Generic funnel transformer.
 *
 * Given an ordered array of stage definitions (key, label, position) plus
 * accumulated counts/aging/rejections, this returns the canonical
 * `FunnelStageRow[]` consumed by the candidate lifecycle and interview
 * lifecycle UIs.
 *
 * The transformer is deterministic, NaN-safe, and tolerant of empty
 * stages, missing data, and reordered pipelines.
 */

import { average, pct, roundTo } from "@/lib/analytics/utils/math";

export interface StageDefinition {
  key: string;
  label: string;
  sortOrder: number;
  isTerminal: boolean;
  /** When true the stage exists in DB but should be excluded from active funnel rendering. */
  isHidden: boolean;
  /** Distinguishes drop/reject buckets from forward-progress stages. */
  stageType: StageType;
}

export type StageType = "active" | "rejected" | "withdrawn" | "terminal";

export interface FunnelStageRow {
  key: string;
  stage: string;
  count: number;
  conversionPct: number;
  dropOffPct: number;
  avgDaysInStage: number;
  rejectionCount: number;
  topRejectionReason: string | null;
  isTerminal: boolean;
  stageType: StageType;
  /** Server-flagged warning when stage SLA was exceeded. */
  agingWarning: boolean;
}

export interface FunnelStageInputs {
  count: number;
  agingDays: number[];
  rejectionCount: number;
  rejectionReasons: Map<string, number>;
}

export interface FunnelTransformOptions {
  agingWarningDays?: number;
}

export function buildFunnelRows(
  stages: readonly StageDefinition[],
  inputs: ReadonlyMap<string, FunnelStageInputs>,
  options: FunnelTransformOptions = {},
): FunnelStageRow[] {
  const visibleStages = stages
    .filter((s) => !s.isHidden && s.stageType === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const rows: FunnelStageRow[] = [];
  for (let i = 0; i < visibleStages.length; i += 1) {
    const stage = visibleStages[i];
    const stageInput = inputs.get(stage.key) ?? {
      count: 0,
      agingDays: [],
      rejectionCount: 0,
      rejectionReasons: new Map(),
    };
    const prev = i === 0 ? null : visibleStages[i - 1];
    const prevCount = prev ? inputs.get(prev.key)?.count ?? 0 : stageInput.count;
    const conversionPct = i === 0 ? 100 : pct(stageInput.count, prevCount);
    const dropOffPct = i === 0 ? 0 : roundTo(Math.max(0, 100 - conversionPct), 2);
    const avgDays = average(stageInput.agingDays);
    const topReason =
      stageInput.rejectionReasons.size > 0
        ? Array.from(stageInput.rejectionReasons.entries()).sort((a, b) => b[1] - a[1])[0][0]
        : null;
    rows.push({
      key: stage.key,
      stage: stage.label,
      count: stageInput.count,
      conversionPct,
      dropOffPct,
      avgDaysInStage: avgDays,
      rejectionCount: stageInput.rejectionCount,
      topRejectionReason: topReason,
      isTerminal: stage.isTerminal,
      stageType: stage.stageType,
      agingWarning:
        options.agingWarningDays != null && avgDays > options.agingWarningDays && stageInput.count > 0,
    });
  }
  return rows;
}
