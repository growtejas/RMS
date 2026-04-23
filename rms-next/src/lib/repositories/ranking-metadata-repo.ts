import { desc, eq, max } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  candidateJobScores,
  rankingVersions,
  skillAliases,
} from "@/lib/db/schema";

export async function selectSkillAliasRows() {
  const db = getDb();
  return db
    .select({
      alias: skillAliases.alias,
      canonicalSkill: skillAliases.canonicalSkill,
    })
    .from(skillAliases);
}

export async function deactivateRankingVersionsForItem(itemId: number) {
  const db = getDb();
  await db
    .update(rankingVersions)
    .set({ isActive: false })
    .where(eq(rankingVersions.requisitionItemId, itemId));
}

export async function insertRankingVersionRow(input: {
  requisitionItemId: number;
  versionNumber: number;
  config: Record<string, unknown>;
}) {
  const db = getDb();
  const [row] = await db
    .insert(rankingVersions)
    .values({
      requisitionItemId: input.requisitionItemId,
      versionNumber: input.versionNumber,
      config: input.config,
      isActive: true,
      createdAt: new Date(),
    })
    .returning({ rankingVersionId: rankingVersions.rankingVersionId });
  return row?.rankingVersionId ?? null;
}

export async function selectMaxRankingVersionNumber(
  itemId: number,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ v: max(rankingVersions.versionNumber) })
    .from(rankingVersions)
    .where(eq(rankingVersions.requisitionItemId, itemId));
  return row?.v != null ? Number(row.v) : 0;
}

export async function insertCandidateJobScoresBatch(
  rows: {
    candidateId: number;
    requisitionItemId: number;
    rankingVersionId: number;
    score: string;
    breakdown: Record<string, unknown>;
  }[],
) {
  if (rows.length === 0) return;
  const db = getDb();
  await db.insert(candidateJobScores).values(
    rows.map((r) => ({
      candidateId: r.candidateId,
      requisitionItemId: r.requisitionItemId,
      rankingVersionId: r.rankingVersionId,
      score: r.score,
      breakdown: r.breakdown,
      computedAt: new Date(),
    })),
  );
}

export async function upsertCandidateJobScore(params: {
  candidateId: number;
  requisitionItemId: number;
  rankingVersionId: number;
  score: string;
  breakdown: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(candidateJobScores)
    .values({
      candidateId: params.candidateId,
      requisitionItemId: params.requisitionItemId,
      rankingVersionId: params.rankingVersionId,
      score: params.score,
      breakdown: params.breakdown,
      computedAt: now,
    })
    .onConflictDoUpdate({
      target: [candidateJobScores.candidateId, candidateJobScores.rankingVersionId],
      set: {
        score: params.score,
        breakdown: params.breakdown,
        computedAt: now,
      },
    });
}

/** Latest version row for an item (highest `version_number`). */
export async function selectLatestRankingVersionIdForRequisitionItem(
  itemId: number,
): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({ rankingVersionId: rankingVersions.rankingVersionId })
    .from(rankingVersions)
    .where(eq(rankingVersions.requisitionItemId, itemId))
    .orderBy(desc(rankingVersions.versionNumber))
    .limit(1);
  return row?.rankingVersionId ?? null;
}

export async function selectCandidateJobScoresForRankingVersion(
  rankingVersionId: number,
): Promise<
  Array<{
    candidateId: number;
    score: string;
    breakdown: Record<string, unknown>;
  }>
> {
  const db = getDb();
  const rows = await db
    .select({
      candidateId: candidateJobScores.candidateId,
      score: candidateJobScores.score,
      breakdown: candidateJobScores.breakdown,
    })
    .from(candidateJobScores)
    .where(eq(candidateJobScores.rankingVersionId, rankingVersionId));
  return rows.map((r) => ({
    candidateId: r.candidateId,
    score: r.score,
    breakdown: (r.breakdown ?? {}) as Record<string, unknown>,
  }));
}
