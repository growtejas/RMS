/**
 * Dynamic pipeline stage resolution shared by every analytics module.
 *
 * - Loads stage definitions from `pipeline_stage_definitions` per
 *   organization (Track 2.1).
 * - Falls back to a deterministic default order when an org has not
 *   customized its pipeline yet.
 * - Provides a `mapToStageKey` helper that uses canonical `stageKey`
 *   matching first, then label-based heuristics for legacy
 *   `applications.current_stage` strings that were free-text in the
 *   pre-Phase-1 era.
 */

import {
  fetchPipelineStageDefinitions,
  type StageDefinitionRow,
} from "@/lib/analytics/pipeline/stages-repo";
import type { StageDefinition, StageType } from "@/lib/analytics/transformers/funnel";

const FALLBACK_STAGES: StageDefinition[] = [
  { key: "applied", label: "Applied", sortOrder: 1, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "screening", label: "Screening", sortOrder: 2, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "technical_round", label: "Technical Round", sortOrder: 3, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "manager_round", label: "Manager Round", sortOrder: 4, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "hr_round", label: "HR Round", sortOrder: 5, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "offer", label: "Offer", sortOrder: 6, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "hired", label: "Hired", sortOrder: 7, isTerminal: true, isHidden: false, stageType: "active" },
  { key: "rejected", label: "Rejected", sortOrder: 99, isTerminal: true, isHidden: false, stageType: "rejected" },
  { key: "withdrawn", label: "Withdrawn", sortOrder: 100, isTerminal: true, isHidden: false, stageType: "withdrawn" },
];

export interface PipelineStageContext {
  /** All stages, including hidden/archived, sorted by `sortOrder`. */
  all: StageDefinition[];
  /** Active forward-progression stages (visible, not rejected/withdrawn). */
  active: StageDefinition[];
  /** Stage keys that represent rejection terminals. */
  rejectionKeys: Set<string>;
  /** Stage keys that represent the final "hired" success outcome. */
  hireKeys: Set<string>;
  /** Maps any incoming raw stage string (key or label, any case) to a canonical key. */
  mapToStageKey: (raw: string | null | undefined) => string | null;
}

function rowToDefinition(row: StageDefinitionRow): StageDefinition {
  return {
    key: row.stageKey,
    label: row.label,
    sortOrder: row.sortOrder,
    isTerminal: row.isTerminal,
    isHidden: row.isHidden || row.archivedAt != null,
    stageType: (row.stageType ?? "active") as StageType,
  };
}

export async function getPipelineStageContext(
  organizationId: string,
): Promise<PipelineStageContext> {
  const rows = await fetchPipelineStageDefinitions(organizationId);
  const definitions = rows.length > 0 ? rows.map(rowToDefinition) : FALLBACK_STAGES;
  return buildStageContext(definitions);
}

export function buildStageContext(definitions: StageDefinition[]): PipelineStageContext {
  const sorted = [...definitions].sort((a, b) => a.sortOrder - b.sortOrder);
  const active = sorted.filter((s) => !s.isHidden && s.stageType === "active");

  const labelLookup = new Map<string, string>();
  const keyLookup = new Map<string, string>();
  for (const stage of sorted) {
    keyLookup.set(stage.key.toLowerCase(), stage.key);
    labelLookup.set(stage.label.toLowerCase(), stage.key);
  }

  const rejectionKeys = new Set(
    sorted.filter((s) => s.stageType === "rejected").map((s) => s.key),
  );
  const hireKeys = new Set(
    sorted
      .filter((s) => s.isTerminal && s.stageType === "active")
      .map((s) => s.key),
  );

  const heuristics: Array<{ test: RegExp; key: string }> = [];
  for (const stage of sorted) {
    heuristics.push({ test: new RegExp(stage.key.replace(/[_\s]/g, ".?"), "i"), key: stage.key });
    heuristics.push({
      test: new RegExp(stage.label.replace(/[_\s]/g, ".?"), "i"),
      key: stage.key,
    });
  }

  function mapToStageKey(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return null;
    const direct = keyLookup.get(normalized) ?? labelLookup.get(normalized);
    if (direct) return direct;
    for (const h of heuristics) {
      if (h.test.test(normalized)) return h.key;
    }
    if (normalized.includes("reject")) return Array.from(rejectionKeys)[0] ?? null;
    if (normalized.includes("withdraw")) {
      const withdrawn = sorted.find((s) => s.stageType === "withdrawn");
      return withdrawn?.key ?? null;
    }
    if (normalized.includes("hire") || normalized.includes("joined")) {
      return Array.from(hireKeys)[0] ?? null;
    }
    return null;
  }

  return {
    all: sorted,
    active,
    rejectionKeys,
    hireKeys,
    mapToStageKey,
  };
}

export const PIPELINE_FALLBACK_STAGES = FALLBACK_STAGES;
