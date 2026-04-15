import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { RequisitionItemWorkflowEngine } from "@/lib/workflow/item-workflow-engine";
import { workflowCatch } from "@/lib/workflow/workflow-http";
import { asAppDb } from "@/lib/workflow/workflow-route-utils";
import { bulkReassignBody } from "@/lib/validators/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { reqId: string } };

function parseReqId(params: { reqId: string }): number | NextResponse {
  const reqId = Number.parseInt(params.reqId, 10);
  if (!Number.isFinite(reqId)) {
    return NextResponse.json({ detail: "Invalid requisition id" }, { status: 422 });
  }
  return reqId;
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

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    const parsed = await parseFastapiJsonBody(req, bulkReassignBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const db = getDb();
    const updatedItems = await db.transaction(async (tx) =>
      RequisitionItemWorkflowEngine.bulkReassign(asAppDb(tx), {
        reqId,
        oldTaId: parsed.data.old_ta_id,
        newTaId: parsed.data.new_ta_id,
        userId: user.userId,
        userRoles: user.roles,
        reason: parsed.data.reason,
        itemIds: parsed.data.item_ids ?? undefined,
      }),
    );

    return NextResponse.json({
      success: true,
      reassigned_count: updatedItems.length,
      req_id: reqId,
      items: updatedItems.map((item) => ({
        item_id: item.itemId,
        role_position: item.rolePosition,
        old_ta_id: parsed.data.old_ta_id,
        new_ta_id: parsed.data.new_ta_id,
      })),
    });
  } catch (e) {
    return workflowCatch(e, "[POST /api/requisitions/.../bulk-reassign]");
  }
}
