import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { RequisitionItemWorkflowEngine } from "@/lib/workflow/item-workflow-engine";
import { workflowCatch } from "@/lib/workflow/workflow-http";
import { asAppDb, requireItemInOrganization } from "@/lib/workflow/workflow-route-utils";
import { reassignItemBody } from "@/lib/validators/workflow";

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
    const denied = requireAnyRole(user, "HR", "Admin");
    if (denied) {
      return denied;
    }

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    await requireItemInOrganization(itemId, user.organizationId);

    const parsed = await parseFastapiJsonBody(req, reassignItemBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const db = getDb();
    const payload = await db.transaction(async (tx) => {
      const dbx = asAppDb(tx);
      const item = await RequisitionItemWorkflowEngine.lockItem(dbx, itemId);
      const oldTaId = item.assignedTa;
      const updated = await RequisitionItemWorkflowEngine.swapTa(dbx, {
        itemId,
        newTaId: parsed.data.new_ta_id,
        userId: user.userId,
        userRoles: user.roles,
        reason: parsed.data.reason,
      });
      return { updated, oldTaId };
    });

    return NextResponse.json({
      success: true,
      item_id: payload.updated.itemId,
      role_position: payload.updated.rolePosition,
      old_ta_id: payload.oldTaId,
      new_ta_id: parsed.data.new_ta_id,
    });
  } catch (e) {
    return workflowCatch(e, "[POST requisition-items/.../reassign]");
  }
}
