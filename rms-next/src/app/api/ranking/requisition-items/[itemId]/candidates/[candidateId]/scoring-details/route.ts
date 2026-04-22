import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { enrichRankingWithCachedAiEvaluations } from "@/lib/services/ai-evaluation/ai-evaluation-service";
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

    const url = new URL(req.url);
    const aiEval = url.searchParams.get("ai_eval") === "1";
    const strictSnapshot =
      url.searchParams.get("strict_snapshot") === "1" ||
      url.searchParams.get("strict_snapshot") === "true";

    const jobReq = await getRankingJobRequirementsForItem(itemId);

    let ranking = await rankCandidatesForRequisitionItem(itemId, { strictSnapshot });
    if (aiEval) {
      ranking = await enrichRankingWithCachedAiEvaluations({
        organizationId: user.organizationId,
        itemId,
        ranking,
      });
    }

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

    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(
      e,
      "[GET /api/ranking/requisition-items/[itemId]/candidates/[candidateId]/scoring-details]",
    );
  }
}
