import { and, eq, or } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { candidateAiEvaluations } from "@/lib/db/schema";
import type { AiEvaluationOutput } from "@/lib/services/ai-evaluation/ai-evaluation.schema";

export type CandidateAiEvaluationRow = {
  evaluationId: number;
  organizationId: string;
  requisitionItemId: number;
  candidateId: number;
  inputHash: string;
  model: string;
  promptVersion: string;
  aiScore: string;
  breakdown: Record<string, unknown>;
  summary: string;
  risks: string[];
  confidence: string;
  rawError: string | null;
  createdAt: Date;
};

export async function selectCandidateAiEvaluationsForPairs(params: {
  organizationId: string;
  requisitionItemId: number;
  pairs: { candidateId: number; inputHash: string }[];
}): Promise<CandidateAiEvaluationRow[]> {
  const { organizationId, requisitionItemId, pairs } = params;
  if (pairs.length === 0) return [];

  const db = getDb();
  const disjuncts = pairs.map((p) =>
    and(
      eq(candidateAiEvaluations.candidateId, p.candidateId),
      eq(candidateAiEvaluations.inputHash, p.inputHash),
    ),
  );

  const rows = await db
    .select()
    .from(candidateAiEvaluations)
    .where(
      and(
        eq(candidateAiEvaluations.organizationId, organizationId),
        eq(candidateAiEvaluations.requisitionItemId, requisitionItemId),
        or(...disjuncts),
      ),
    );
  return rows.map((r) => ({
    ...r,
    breakdown: r.breakdown as Record<string, unknown>,
  }));
}

export async function upsertCandidateAiEvaluation(input: {
  organizationId: string;
  requisitionItemId: number;
  candidateId: number;
  inputHash: string;
  model: string;
  promptVersion: string;
  aiScore: number;
  breakdown: Pick<
    AiEvaluationOutput,
    | "project_complexity"
    | "growth_trajectory"
    | "company_reputation"
    | "jd_alignment"
  >;
  summary: string;
  risks: string[];
  confidence: number;
  rawError?: string | null;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(candidateAiEvaluations)
    .values({
      organizationId: input.organizationId,
      requisitionItemId: input.requisitionItemId,
      candidateId: input.candidateId,
      inputHash: input.inputHash,
      model: input.model,
      promptVersion: input.promptVersion,
      aiScore: String(input.aiScore),
      breakdown: input.breakdown,
      summary: input.summary,
      risks: input.risks,
      confidence: String(input.confidence),
      rawError: input.rawError ?? null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [
        candidateAiEvaluations.requisitionItemId,
        candidateAiEvaluations.candidateId,
        candidateAiEvaluations.inputHash,
      ],
      set: {
        model: input.model,
        promptVersion: input.promptVersion,
        aiScore: String(input.aiScore),
        breakdown: input.breakdown,
        summary: input.summary,
        risks: input.risks,
        confidence: String(input.confidence),
        rawError: input.rawError ?? null,
        createdAt: now,
      },
    });
}
