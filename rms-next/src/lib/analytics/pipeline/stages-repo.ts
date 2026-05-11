import { asc, eq } from "drizzle-orm";

import { getReadDb } from "@/lib/db";
import { pipelineStageDefinitions } from "@/lib/db/schema";

export interface StageDefinitionRow {
  id: number;
  organizationId: string;
  stageKey: string;
  label: string;
  sortOrder: number;
  isTerminal: boolean;
  isHidden: boolean;
  archivedAt: Date | null;
  stageType: "active" | "rejected" | "withdrawn" | "terminal";
}

function inferStageType(isTerminal: boolean, stageKey: string, label: string): StageDefinitionRow["stageType"] {
  const hay = `${stageKey} ${label}`.toLowerCase();
  if (hay.includes("reject")) return "rejected";
  if (hay.includes("withdraw")) return "withdrawn";
  if (isTerminal) return "terminal";
  return "active";
}

function isMissingColumnError(e: unknown, column: string): boolean {
  const msg =
    e instanceof Error
      ? `${e.message}\n${(e as Error & { cause?: unknown }).cause ?? ""}`
      : String(e);
  return (
    msg.includes("does not exist") &&
    (msg.includes(`column "${column}"`) || msg.includes(`column '${column}'`) || msg.includes(column))
  );
}

/** Pre-0030 schema: only base columns on `pipeline_stage_definitions`. */
async function fetchPipelineStageDefinitionsLegacy(
  organizationId: string,
): Promise<StageDefinitionRow[]> {
  const db = getReadDb();
  const rows = await db
    .select({
      id: pipelineStageDefinitions.id,
      organizationId: pipelineStageDefinitions.organizationId,
      stageKey: pipelineStageDefinitions.stageKey,
      label: pipelineStageDefinitions.label,
      sortOrder: pipelineStageDefinitions.sortOrder,
      isTerminal: pipelineStageDefinitions.isTerminal,
    })
    .from(pipelineStageDefinitions)
    .where(eq(pipelineStageDefinitions.organizationId, organizationId))
    .orderBy(asc(pipelineStageDefinitions.sortOrder));

  return rows.map((r) => ({
    ...r,
    isHidden: false,
    archivedAt: null,
    stageType: inferStageType(r.isTerminal, r.stageKey, r.label),
  }));
}

async function fetchPipelineStageDefinitionsFull(
  organizationId: string,
): Promise<StageDefinitionRow[]> {
  const db = getReadDb();
  const rows = await db
    .select({
      id: pipelineStageDefinitions.id,
      organizationId: pipelineStageDefinitions.organizationId,
      stageKey: pipelineStageDefinitions.stageKey,
      label: pipelineStageDefinitions.label,
      sortOrder: pipelineStageDefinitions.sortOrder,
      isTerminal: pipelineStageDefinitions.isTerminal,
      isHidden: pipelineStageDefinitions.isHidden,
      archivedAt: pipelineStageDefinitions.archivedAt,
      stageType: pipelineStageDefinitions.stageType,
    })
    .from(pipelineStageDefinitions)
    .where(eq(pipelineStageDefinitions.organizationId, organizationId))
    .orderBy(asc(pipelineStageDefinitions.sortOrder));

  return rows.map((r) => ({
    ...r,
    stageType: (r.stageType as StageDefinitionRow["stageType"]) ?? inferStageType(r.isTerminal, r.stageKey, r.label),
  }));
}

/**
 * Loads org pipeline stage definitions. Works before and after migration
 * `0030_analytics_dynamic_stages`: if new columns are missing, falls back to
 * a legacy SELECT and sensible defaults (run `npm run db:migrate` for full
 * hidden/archived/stage_type support).
 */
export async function fetchPipelineStageDefinitions(
  organizationId: string,
): Promise<StageDefinitionRow[]> {
  try {
    return await fetchPipelineStageDefinitionsFull(organizationId);
  } catch (e) {
    if (isMissingColumnError(e, "is_hidden") || isMissingColumnError(e, "archived_at") || isMissingColumnError(e, "stage_type")) {
      return fetchPipelineStageDefinitionsLegacy(organizationId);
    }
    throw e;
  }
}

