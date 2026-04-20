import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { patchPipelineRankingJdSettings } from "@/lib/services/requisitions-write-service";
import { pipelineRankingJdPatchBody } from "@/lib/validators/pipeline-ranking-jd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { itemId: string } };

function parseItemId(params: { itemId: string }): number | NextResponse {
  const itemId = Number.parseInt(params.itemId, 10);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ detail: "Invalid item id" }, { status: 422 });
  }
  return itemId;
}

/** PATCH — ranking-only JD: use requisition JD toggle + optional free-text JD. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Owner", "Manager");
    if (denied) {
      return denied;
    }

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    const parsed = await parseFastapiJsonBody(req, pipelineRankingJdPatchBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await patchPipelineRankingJdSettings(
      itemId,
      user.organizationId,
      {
        use_requisition_jd: parsed.data.use_requisition_jd,
        pipeline_jd_text: parsed.data.pipeline_jd_text,
        ranking_required_skills: parsed.data.ranking_required_skills,
      },
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/requisitions/items/[itemId]/pipeline-ranking-jd]");
  }
}
