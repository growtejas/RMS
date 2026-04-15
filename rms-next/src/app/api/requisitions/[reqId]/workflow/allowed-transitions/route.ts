import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { requisitions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  HEADER_TERMINAL_STATES,
  buildAllowedHeaderTransitions,
} from "@/lib/workflow/workflow-allowed";
import { workflowCatch } from "@/lib/workflow/workflow-http";
import { isRequisitionStatus } from "@/types/workflow";

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

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(
      user,
      "Manager",
      "Admin",
      "HR",
      "TA",
    );
    if (denied) {
      return denied;
    }

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.reqId, reqId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ detail: "Requisition not found" }, { status: 404 });
    }

    if (!isRequisitionStatus(row.overallStatus)) {
      return NextResponse.json(
        { detail: `Invalid status value: ${row.overallStatus}` },
        { status: 400 },
      );
    }

    const current = row.overallStatus;
    const isTerminal = HEADER_TERMINAL_STATES.has(current);

    return NextResponse.json({
      entity_type: "requisition",
      entity_id: reqId,
      current_status: current,
      is_terminal: isTerminal,
      allowed_transitions: buildAllowedHeaderTransitions(current),
    });
  } catch (e) {
    return workflowCatch(e, "[GET /api/requisitions/.../workflow/allowed-transitions]");
  }
}
