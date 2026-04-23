import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { enrichRankingWithCachedAiEvaluations } from "@/lib/services/ai-evaluation/ai-evaluation-service";
import { resolveRankingEngine } from "@/lib/services/scoring/ranking-engine";
import {
  getRankingJobRequirementsForItem,
  pickCandidateScoringDetailsFromRanking,
  rankCandidatesForRequisitionItem,
} from "@/lib/services/ranking-service";
import {
  assertCandidateInOrganization,
  assertRequisitionItemInOrganization,
} from "@/lib/tenant/org-assert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { itemId: string; candidateId: string } };

function parseId(raw: string, label: string): number | NextResponse {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return NextResponse.json({ detail: `Invalid ${label}` }, { status: 422 });
  }
  return n;
}

/**
 * GET /api/ranking/requisition-items/{itemId}/candidates/{candidateId}/scoring-details
 *
 * Returns `score` + `explain` (ranking_signals, ats_v1, resume_parser) plus `job_requirements`
 * (same payload as GET .../job-requirements) so callers see both sides of the calculation.
 *
 * Query: `strict_snapshot` (same as list endpoint), `ai_eval=1` (merge cached AI eval; requires org check).
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const itemId = parseId(params.itemId, "requisition item id");
    if (itemId instanceof NextResponse) {
      return itemId;
    }
    const candidateId = parseId(params.candidateId, "candidate id");
    if (candidateId instanceof NextResponse) {
      return candidateId;
    }

    await assertRequisitionItemInOrganization(itemId, user.organizationId);
    await assertCandidateInOrganization(candidateId, user.organizationId);

    const engine = resolveRankingEngine();
    if (engine.engine !== "ai_only") {
      return NextResponse.json(
        {
          detail: `Ranking engine misconfigured: expected ai_only, got ${engine.engine} (env RANKING_ENGINE=${process.env.RANKING_ENGINE ?? ""})`,
        },
        { status: 500 },
      );
    }

    const url = new URL(req.url);
    const strictSnapshot =
      url.searchParams.get("strict_snapshot") === "1" ||
      url.searchParams.get("strict_snapshot") === "true";

    const jobReq = await getRankingJobRequirementsForItem(itemId);

    let ranking = await rankCandidatesForRequisitionItem(itemId, { strictSnapshot });
    ranking = await enrichRankingWithCachedAiEvaluations({
      organizationId: user.organizationId,
      itemId,
      ranking,
    });

    const data = pickCandidateScoringDetailsFromRanking(ranking, candidateId, jobReq);
    if (!data) {
      return NextResponse.json(
        {
          detail:
            "Candidate not found in this job line ranking snapshot (not on the line or no ranking yet).",
        },
        { status: 404 },
      );
    }

    // Strict ai_only: return only AI-facing explain + minimal ranking metadata.
    return NextResponse.json({
      ranking_engine: "ai_only",
      requisition_item_id: data.requisition_item_id,
      req_id: data.req_id,
      candidate_id: data.candidate_id,
      full_name: data.full_name,
      email: data.email,
      current_stage: data.current_stage,
      generated_at: data.generated_at,
      ranking_version: data.ranking_version,
      total_candidates: data.total_candidates,
      score: data.score,
      ...(data.flags ? { flags: data.flags } : {}),
      explain: {
        ai_breakdown: data.explain.ai_breakdown,
        ai_summary: data.explain.ai_summary,
        ai_risks: data.explain.ai_risks,
        ai_confidence: data.explain.ai_confidence,
      },
      job_requirements: {
        ranking_engine: "ai_only",
        requisition_item_id: data.job_requirements.requisition_item_id,
        req_id: data.job_requirements.req_id,
        jd_narrative: data.job_requirements.jd_narrative,
        composite_scoring_text: data.job_requirements.composite_scoring_text,
        required_skills: data.job_requirements.required_skills,
        ats_job_profile: data.job_requirements.ats_job_profile,
        scoring_config: { ranking_engine: "ai_only" },
        item_snapshot: data.job_requirements.item_snapshot,
        control: data.job_requirements.control,
      },
      meta: { ranking_engine: "ai_only", ai_eval_enriched: true },
    });
  } catch (e) {
    return referenceWriteCatch(
      e,
      "[GET /api/ranking/requisition-items/[itemId]/candidates/[candidateId]/scoring-details]",
    );
  }
}
