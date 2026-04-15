import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { RequisitionWorkflowEngine } from "@/lib/workflow/requisition-workflow-engine";
import { workflowCatch, workflowTransitionJson } from "@/lib/workflow/workflow-http";
import { asAppDb } from "@/lib/workflow/workflow-route-utils";
import { workflowTransitionBody } from "@/lib/validators/workflow";

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

    const parsed = await parseFastapiJsonBody(req, workflowTransitionBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const db = getDb();
    const row = await db.transaction(async (tx) =>
      RequisitionWorkflowEngine.approveHr(asAppDb(tx), {
        reqId,
        userId: user.userId,
        userRoles: user.roles,
        expectedVersion: parsed.data.expected_version ?? undefined,
      }),
    );

    return NextResponse.json(
      workflowTransitionJson({
        entityId: row.reqId,
        entityType: "requisition",
        previousStatus: "Pending_HR",
        newStatus: row.overallStatus,
        transitionedBy: user.userId,
      }),
    );
  } catch (e) {
    return workflowCatch(e, "[POST workflow/approve-hr]");
  }
}
