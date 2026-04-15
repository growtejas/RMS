import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { RequisitionItemWorkflowEngine } from "@/lib/workflow/item-workflow-engine";
import { workflowCatch, workflowTransitionJson } from "@/lib/workflow/workflow-http";
import { asAppDb } from "@/lib/workflow/workflow-route-utils";
import { shortlistBody } from "@/lib/validators/workflow";

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

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "Admin");
    if (denied) {
      return denied;
    }

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    const parsed = await parseFastapiJsonBody(req, shortlistBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const db = getDb();
    let previousStatus = "";
    const updated = await db.transaction(async (tx) => {
      const dbx = asAppDb(tx);
      const pre = await RequisitionItemWorkflowEngine.lockItem(dbx, itemId);
      previousStatus = pre.itemStatus;
      return RequisitionItemWorkflowEngine.shortlist(dbx, {
        itemId,
        userId: user.userId,
        userRoles: user.roles,
        candidateCount: parsed.data.candidate_count ?? undefined,
      });
    });

    return NextResponse.json(
      workflowTransitionJson({
        entityId: updated.itemId,
        entityType: "requisition_item",
        previousStatus,
        newStatus: updated.itemStatus,
        transitionedBy: user.userId,
      }),
    );
  } catch (e) {
    return workflowCatch(e, "[POST item workflow/shortlist]");
  }
}
