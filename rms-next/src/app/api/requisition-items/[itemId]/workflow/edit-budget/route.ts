import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { RequisitionItemWorkflowEngine } from "@/lib/workflow/item-workflow-engine";
import { workflowCatch } from "@/lib/workflow/workflow-http";
import { asAppDb } from "@/lib/workflow/workflow-route-utils";
import { itemBudgetEditBody } from "@/lib/validators/workflow";

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

    const parsed = await parseFastapiJsonBody(req, itemBudgetEditBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const db = getDb();
    const updated = await db.transaction(async (tx) =>
      RequisitionItemWorkflowEngine.editBudget(asAppDb(tx), {
        itemId,
        estimatedBudget: parsed.data.estimated_budget,
        currency: parsed.data.currency,
        userId: user.userId,
        userRoles: user.roles,
      }),
    );

    const appr = updated.approvedBudget;
    return NextResponse.json({
      success: true,
      item_id: updated.itemId,
      estimated_budget: Number(updated.estimatedBudget),
      approved_budget:
        appr != null && appr !== "" ? Number(appr) : null,
      currency: updated.currency,
      budget_status:
        appr != null && appr !== "" ? "approved" : "pending",
    });
  } catch (e) {
    return workflowCatch(e, "[POST item workflow/edit-budget]");
  }
}
