import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { enrichRankingWithCachedAiEvaluations } from "@/lib/services/ai-evaluation/ai-evaluation-service";
import {
  rankCandidatesForRequisitionItem,
  recomputeRankingForRequisitionItem,
} from "@/lib/services/ranking-service";
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

/** GET /api/ranking/requisition-items/{itemId} — phase 5 deterministic ranking. */
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

    const url = new URL(req.url);
    const aiEval = url.searchParams.get("ai_eval") === "1";
    const strictSnapshot =
      url.searchParams.get("strict_snapshot") === "1" ||
      url.searchParams.get("strict_snapshot") === "true";

    const data = await rankCandidatesForRequisitionItem(itemId, {
      strictSnapshot,
    });
    if (aiEval) {
      await assertRequisitionItemInOrganization(itemId, user.organizationId);
      return NextResponse.json(
        await enrichRankingWithCachedAiEvaluations({
          organizationId: user.organizationId,
          itemId,
          ranking: data,
        }),
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/ranking/requisition-items/[itemId]]");
  }
}

/** POST /api/ranking/requisition-items/{itemId} — force ranking recompute + snapshot write. */
export async function POST(req: Request, { params }: Ctx) {
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

    const data = await recomputeRankingForRequisitionItem(itemId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/ranking/requisition-items/[itemId]]");
  }
}
