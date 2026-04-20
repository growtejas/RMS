import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { candidates } from "@/lib/db/schema";
import {
  selectCandidateAiEvaluationsForPairs,
  upsertCandidateAiEvaluation,
} from "@/lib/repositories/candidate-ai-evaluations-repo";
import { assertRequisitionItemInOrganization } from "@/lib/tenant/org-assert";
import {
  blendDeterministicWithAi,
  resolveAiBlendWeight,
  type CandidateEvaluationInput,
  type JobEvaluationInput,
} from "@/lib/services/ai-evaluation/ai-evaluation.schema";
import {
  buildCandidateEvaluationInputFromSignals,
  buildJobEvaluationInput,
  canonicalAiEvaluationInputHash,
  parsedArtifactFromRankingExplain,
} from "@/lib/services/ai-evaluation/build-ai-evaluation-payload";
import {
  resolveAiEvalEnabled,
  resolveAiEvalMinIntervalMs,
  resolveAiEvalActiveModel,
  resolveAiEvalPromptVersion,
  runAiEvaluationLlm,
} from "@/lib/services/ai-evaluation/ai-evaluation-llm";
import { buildCandidateRankingSignals } from "@/lib/services/candidate-ranking-signals";
import { parseResumeStructuredDocument } from "@/lib/services/resume-structure/resume-structure.schema";
import {
  loadRankingRequiredContextForItem,
  rankCandidatesForRequisitionItem,
  type RankedCandidateRow,
  type RequisitionItemRankingJson,
} from "@/lib/services/ranking-service";

const SCORE_TIE_EPS = 0.01;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildSignalsForAiRow(params: {
  candidateRow: typeof candidates.$inferSelect;
  rankedRow: RankedCandidateRow;
}) {
  const structuredFromDb = parseResumeStructuredDocument(
    params.candidateRow.resumeStructuredProfile,
  );
  const structuredDocument = structuredFromDb.ok ? structuredFromDb.data : null;
  const pseudo = parsedArtifactFromRankingExplain(params.rankedRow.explain);
  return buildCandidateRankingSignals({
    candidate: {
      candidateSkills: params.candidateRow.candidateSkills,
      totalExperienceYears: params.candidateRow.totalExperienceYears,
      noticePeriodDays: params.candidateRow.noticePeriodDays,
      educationRaw: params.candidateRow.educationRaw,
    },
    parsedArtifact: pseudo,
    structuredDocument,
  });
}

/**
 * Merge cached AI evaluations into a ranking payload (no LLM). Re-sorts by blended `final_score`.
 */
export async function enrichRankingWithCachedAiEvaluations(params: {
  organizationId: string;
  itemId: number;
  ranking: RequisitionItemRankingJson;
}): Promise<RequisitionItemRankingJson> {
  const { item, requiredText, requiredSkillsList } = await loadRankingRequiredContextForItem(
    params.itemId,
  );

  const job = buildJobEvaluationInput({
    item,
    requiredSkillsList,
    requiredTextForSummary: requiredText,
  });
  const model = resolveAiEvalActiveModel();
  const promptVersion = resolveAiEvalPromptVersion();

  const candIds = params.ranking.ranked_candidates.map((r) => r.candidate_id);
  if (candIds.length === 0) {
    return {
      ...params.ranking,
      meta: { ...params.ranking.meta, ai_eval_enriched: true } as RequisitionItemRankingJson["meta"],
    };
  }

  const db = getDb();
  const candRows = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.requisitionItemId, params.itemId),
        eq(candidates.organizationId, params.organizationId),
        inArray(candidates.candidateId, candIds),
      ),
    );
  const byId = new Map(candRows.map((c) => [c.candidateId, c]));

  const pairByCandidateId = new Map<
    number,
    { inputHash: string; row: RankedCandidateRow }
  >();
  for (const row of params.ranking.ranked_candidates) {
    const c = byId.get(row.candidate_id);
    if (!c) continue;
    const signals = buildSignalsForAiRow({ candidateRow: c, rankedRow: row });
    const candidateInput = buildCandidateEvaluationInputFromSignals(signals);
    const inputHash = canonicalAiEvaluationInputHash({
      job,
      candidate: candidateInput,
      model,
      promptVersion,
    });
    pairByCandidateId.set(row.candidate_id, { inputHash, row });
  }

  const pairList = Array.from(pairByCandidateId.entries()).map(([candidateId, p]) => ({
    candidateId,
    inputHash: p.inputHash,
  }));
  const evalRows = await selectCandidateAiEvaluationsForPairs({
    organizationId: params.organizationId,
    requisitionItemId: params.itemId,
    pairs: pairList,
  });
  const evalMap = new Map(
    evalRows.map((e) => [`${e.candidateId}\0${e.inputHash}`, e]),
  );

  const nextRanked: RankedCandidateRow[] = params.ranking.ranked_candidates.map((row) => {
    const p = pairByCandidateId.get(row.candidate_id);
    if (!p) return row;
    const ev = evalMap.get(`${row.candidate_id}\0${p.inputHash}`);
    if (!ev) return row;

    const det = row.score.final_score;
    const aiScore = Number(ev.aiScore);
    const conf = Number(ev.confidence);
    const w = resolveAiBlendWeight(conf);
    const display = blendDeterministicWithAi(det, aiScore, conf);
    const breakdown = ev.breakdown as {
      project_complexity: number;
      growth_trajectory: number;
      company_reputation: number;
      jd_alignment: number;
    };

    return {
      ...row,
      score: {
        ...row.score,
        deterministic_final_score: det,
        final_score: display,
      },
      explain: {
        ...row.explain,
        deterministic_final_score: det,
        ai_score: aiScore,
        ai_breakdown: breakdown,
        ai_confidence: conf,
        ai_summary: ev.summary,
        ai_risks: ev.risks,
        ai_blend_weight: w,
      },
    };
  });

  nextRanked.sort((a, b) => {
    const d = b.score.final_score - a.score.final_score;
    if (Math.abs(d) > SCORE_TIE_EPS) return d;
    const ar = a.meta?.skill_match_ratio ?? -1;
    const br = b.meta?.skill_match_ratio ?? -1;
    if (br !== ar) return br - ar;
    return a.full_name.localeCompare(b.full_name);
  });

  return {
    ...params.ranking,
    ranked_candidates: nextRanked,
    meta: { ...params.ranking.meta, ai_eval_enriched: true } as RequisitionItemRankingJson["meta"],
  };
}

export type AiEvalRunResult = {
  candidate_id: number;
  status: "ok" | "skipped_cache" | "disabled" | "llm_failed" | "not_found";
  input_hash?: string;
  ai_score?: number;
  /** Set when status is llm_failed (safe to return to clients). */
  llm_failure_reason?: string;
  llm_http_status?: number;
  /**
   * Normalized job + candidate JSON used for cache hash and (after optional clipping) the LLM user message.
   * Present only when `includeEvalInput` was true on the POST body.
   */
  eval_input?: {
    job: JobEvaluationInput;
    candidate: CandidateEvaluationInput;
  };
};

/**
 * Run LLM evaluation for the given candidates (cache-aware). Uses ranking snapshot for parser fallback.
 */
export async function executeAiEvaluationsForItem(input: {
  organizationId: string;
  itemId: number;
  candidateIds: number[];
  force: boolean;
  /** When true, each result includes `eval_input` (job + candidate) for inspection. */
  includeEvalInput?: boolean;
}): Promise<{ results: AiEvalRunResult[] }> {
  await assertRequisitionItemInOrganization(input.itemId, input.organizationId);

  if (!resolveAiEvalEnabled()) {
    return {
      results: input.candidateIds.map((candidate_id) => ({
        candidate_id,
        status: "disabled" as const,
      })),
    };
  }

  const ranking = await rankCandidatesForRequisitionItem(input.itemId, {
    strictSnapshot: false,
  });
  const rankedById = new Map(ranking.ranked_candidates.map((r) => [r.candidate_id, r]));

  const { item, requiredText, requiredSkillsList } = await loadRankingRequiredContextForItem(
    input.itemId,
  );
  const job = buildJobEvaluationInput({
    item,
    requiredSkillsList,
    requiredTextForSummary: requiredText,
  });
  const model = resolveAiEvalActiveModel();
  const promptVersion = resolveAiEvalPromptVersion();

  const db = getDb();
  const candRows =
    input.candidateIds.length === 0
      ? []
      : await db
          .select()
          .from(candidates)
          .where(
            and(
              eq(candidates.requisitionItemId, input.itemId),
              eq(candidates.organizationId, input.organizationId),
              inArray(candidates.candidateId, input.candidateIds),
            ),
          );
  const byId = new Map(candRows.map((c) => [c.candidateId, c]));

  const prepared: Array<{
    candidateId: number;
    inputHash: string;
    rankedRow: RankedCandidateRow;
  }> = [];

  for (const cid of input.candidateIds) {
    const rankedRow = rankedById.get(cid);
    const c = byId.get(cid);
    if (!rankedRow || !c) {
      continue;
    }
    const signals = buildSignalsForAiRow({ candidateRow: c, rankedRow });
    const candidateInput = buildCandidateEvaluationInputFromSignals(signals);
    const inputHash = canonicalAiEvaluationInputHash({
      job,
      candidate: candidateInput,
      model,
      promptVersion,
    });
    prepared.push({ candidateId: cid, inputHash, rankedRow });
  }

  const preparedById = new Map(prepared.map((p) => [p.candidateId, p]));

  const cacheScoreByKey = new Map<string, string>();
  if (!input.force && prepared.length > 0) {
    const hits = await selectCandidateAiEvaluationsForPairs({
      organizationId: input.organizationId,
      requisitionItemId: input.itemId,
      pairs: prepared.map((p) => ({ candidateId: p.candidateId, inputHash: p.inputHash })),
    });
    for (const h of hits) {
      cacheScoreByKey.set(`${h.candidateId}\0${h.inputHash}`, h.aiScore);
    }
  }

  const results: AiEvalRunResult[] = [];
  const interval = resolveAiEvalMinIntervalMs();

  function hasMoreLlmAhead(fromIndex: number): boolean {
    for (let j = fromIndex + 1; j < input.candidateIds.length; j++) {
      const cj = input.candidateIds[j];
      const pj = preparedById.get(cj);
      if (!pj) continue;
      if (!input.force && cacheScoreByKey.has(`${cj}\0${pj.inputHash}`)) continue;
      return true;
    }
    return false;
  }

  for (let i = 0; i < input.candidateIds.length; i++) {
    const cid = input.candidateIds[i];
    const p = preparedById.get(cid);
    if (!p) {
      results.push({ candidate_id: cid, status: "not_found" });
      continue;
    }

    const cacheKey = `${cid}\0${p.inputHash}`;
    if (!input.force && cacheScoreByKey.has(cacheKey)) {
      const row = byId.get(cid)!;
      const signalsSkip = buildSignalsForAiRow({ candidateRow: row, rankedRow: p.rankedRow });
      const candidateInputSkip = buildCandidateEvaluationInputFromSignals(signalsSkip);
      results.push({
        candidate_id: cid,
        status: "skipped_cache",
        input_hash: p.inputHash,
        ai_score: Number(cacheScoreByKey.get(cacheKey)),
        ...(input.includeEvalInput
          ? { eval_input: { job, candidate: candidateInputSkip } }
          : {}),
      });
      continue;
    }

    const c = byId.get(cid)!;
    const signals = buildSignalsForAiRow({ candidateRow: c, rankedRow: p.rankedRow });
    const candidateInput = buildCandidateEvaluationInputFromSignals(signals);

    const llm = await runAiEvaluationLlm({
      job,
      candidate: candidateInput,
      logContext: { candidate_id: cid, requisition_item_id: input.itemId },
    });
    if (!llm.ok) {
      results.push({
        candidate_id: cid,
        status: "llm_failed",
        input_hash: p.inputHash,
        llm_failure_reason: llm.reason,
        ...(llm.http_status != null ? { llm_http_status: llm.http_status } : {}),
        ...(input.includeEvalInput ? { eval_input: { job, candidate: candidateInput } } : {}),
      });
    } else {
      await upsertCandidateAiEvaluation({
        organizationId: input.organizationId,
        requisitionItemId: input.itemId,
        candidateId: cid,
        inputHash: p.inputHash,
        model,
        promptVersion,
        aiScore: llm.aiScore,
        breakdown: {
          project_complexity: llm.output.project_complexity,
          growth_trajectory: llm.output.growth_trajectory,
          company_reputation: llm.output.company_reputation,
          jd_alignment: llm.output.jd_alignment,
        },
        summary: llm.output.summary,
        risks: llm.output.risks,
        confidence: llm.output.confidence,
        rawError: null,
      });
      results.push({
        candidate_id: cid,
        status: "ok",
        input_hash: p.inputHash,
        ai_score: llm.aiScore,
        ...(input.includeEvalInput ? { eval_input: { job, candidate: candidateInput } } : {}),
      });
    }

    if (interval > 0 && hasMoreLlmAhead(i)) {
      await sleep(interval);
    }
  }

  return { results };
}
