import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { recomputeRankingForRequisitionItem } from "@/lib/services/ranking-service";
import { assertRequisitionItemInOrganization } from "@/lib/tenant/org-assert";
import { rankingRequisitionItemBody } from "@/lib/validators/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ranking/recalculate — same as POST /api/ranking/run (new ranking version + full recompute). */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(req, rankingRequisitionItemBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const itemId = parsed.data.requisition_item_id;
    await assertRequisitionItemInOrganization(itemId, user.organizationId);
    const data = await recomputeRankingForRequisitionItem(itemId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/ranking/recalculate]");
  }
}
