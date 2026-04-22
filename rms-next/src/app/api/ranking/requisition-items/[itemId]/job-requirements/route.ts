import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getRankingJobRequirementsForItem } from "@/lib/services/ranking-service";
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

    const data = await getRankingJobRequirementsForItem(itemId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/ranking/requisition-items/[itemId]/job-requirements]");
  }
}
