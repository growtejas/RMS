import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { assignTaToRequisitionHeader } from "@/lib/services/requisition-assign-ta";
import { asAppDb } from "@/lib/workflow/workflow-route-utils";
import { assignTaBody } from "@/lib/validators/workflow";

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

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "HR", "TA");
    if (denied) {
      return denied;
    }

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    const parsed = await parseFastapiJsonBody(req, assignTaBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const db = getDb();
    const result = await db.transaction(async (tx) =>
      assignTaToRequisitionHeader(asAppDb(tx), {
        reqId,
        taUserId: parsed.data.ta_user_id,
        performedBy: user.userId,
        userRoles: user.roles,
      }),
    );

    return NextResponse.json(result);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/requisitions/.../assign-ta]");
  }
}
