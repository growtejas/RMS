import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getRankingJobRequirementsForItem } from "@/lib/services/ranking-service";
import { resolveRankingEngine } from "@/lib/services/scoring/ranking-engine";
import { assertRequisitionItemInOrganization } from "@/lib/tenant/org-assert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { itemId: string } };

function parseItemId(raw: string): number | NextResponse {
  const itemId = Number.parseInt(raw, 10);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ detail: "Invalid requisition item id" }, { status: 422 });
  }
  return itemId;
}

/**
 * GET /api/ranking/requisition-items/{itemId}/job-requirements
 *
 * Returns the job-side inputs used for ranking and ATS V1 on this line: JD source, composite text
 * excerpts, resolved required skills (and how they were resolved), item ATS fields, and engine weights.
 * Control inputs via PATCH /api/requisitions/items/{itemId}/pipeline-ranking-jd then POST ranking recompute.
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

    const itemId = parseItemId(params.itemId);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    await assertRequisitionItemInOrganization(itemId, user.organizationId);

    const engine = resolveRankingEngine();
    if (engine.engine !== "ai_only") {
      return NextResponse.json(
        {
          detail: `Ranking engine misconfigured: expected ai_only, got ${engine.engine} (env RANKING_ENGINE=${process.env.RANKING_ENGINE ?? ""})`,
        },
        { status: 500 },
      );
    }

    const data = await getRankingJobRequirementsForItem(itemId);
    return NextResponse.json({
      ranking_engine: "ai_only",
      requisition_item_id: data.requisition_item_id,
      req_id: data.req_id,
      jd_narrative: data.jd_narrative,
      composite_scoring_text: data.composite_scoring_text,
      required_skills: data.required_skills,
      ats_job_profile: data.ats_job_profile,
      scoring_config: { ranking_engine: "ai_only" },
      item_snapshot: data.item_snapshot,
      control: data.control,
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/ranking/requisition-items/[itemId]/job-requirements]");
  }
}
