import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { RequisitionItemWorkflowEngine } from "@/lib/workflow/item-workflow-engine";
import { workflowCatch } from "@/lib/workflow/workflow-http";
import { asAppDb } from "@/lib/workflow/workflow-route-utils";
import { itemBudgetRejectBody } from "@/lib/validators/workflow";

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
    const denied = requireAnyRole(user, "Manager", "HR", "Admin");
    if (denied) {
      return denied;
    }

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    const parsed = await parseFastapiJsonBody(req, itemBudgetRejectBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const db = getDb();
    const updated = await db.transaction(async (tx) =>
      RequisitionItemWorkflowEngine.rejectBudget(asAppDb(tx), {
        itemId,
        userId: user.userId,
        userRoles: user.roles,
        reason: parsed.data.reason,
      }),
    );

    return NextResponse.json({
      success: true,
      item_id: updated.itemId,
      estimated_budget: Number(updated.estimatedBudget),
      approved_budget: null,
      currency: updated.currency,
      budget_status: "rejected",
    });
  } catch (e) {
    return workflowCatch(e, "[POST item workflow/reject-budget]");
  }
}
