import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  createRequisitionItemNonWorkflow,
  listRequisitionItemsJson,
} from "@/lib/services/requisitions-write-service";
import { requisitionItemCreateBody } from "@/lib/validators/requisition-write";

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

/** GET /api/requisitions/{reqId}/items */
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
      "Employee",
      "TA",
    );
    if (denied) {
      return denied;
    }

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    const data = await listRequisitionItemsJson(reqId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/requisitions/[reqId]/items]");
  }
}

/**
 * POST /api/requisitions/{reqId}/items — create item without workflow recalculate (Phase D).
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager", "Admin", "HR");
    if (denied) {
      return denied;
    }

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    const parsed = await parseFastapiJsonBody(req, requisitionItemCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await createRequisitionItemNonWorkflow(reqId, parsed.data);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/requisitions/[reqId]/items]");
  }
}
