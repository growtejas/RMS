import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getInterviewerScope } from "@/lib/auth/interviewer-scope";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { getRequisitionDetailRead } from "@/lib/services/requisitions-read-service";
import {
  patchRequisitionNonWorkflow,
  putRequisitionManager,
} from "@/lib/services/requisitions-write-service";
import {
  requisitionManagerPutBody,
  requisitionPatchBody,
} from "@/lib/validators/requisition-write";

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

/** GET /api/requisitions/{reqId} — read-only detail + computed fields (Phase C). */
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
      "Interviewer",
    );
    if (denied) {
      return denied;
    }

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }
    const interviewerScope = await getInterviewerScope(user);
    if (
      interviewerScope.interviewerOnly &&
      !interviewerScope.requisitionIds.has(reqId)
    ) {
      return NextResponse.json(
        { detail: "Access denied for this requisition." },
        { status: 403 },
      );
    }

    const data = await getRequisitionDetailRead(reqId, user.organizationId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/requisitions/[reqId]]");
  }
}

/** PUT /api/requisitions/{reqId} — manager full update + optional item replace (FastAPI parity). */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager");
    if (denied) {
      return denied;
    }

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    const parsed = await parseFastapiJsonBody(req, requisitionManagerPutBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await putRequisitionManager(
      reqId,
      user.organizationId,
      parsed.data,
      user.userId,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[PUT /api/requisitions/[reqId]]");
  }
}

/** PATCH /api/requisitions/{reqId} — non-workflow field patch (blocked workflow keys excluded in schema). */
export async function PATCH(req: Request, { params }: Ctx) {
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

    const parsed = await parseFastapiJsonBody(req, requisitionPatchBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await patchRequisitionNonWorkflow(
      reqId,
      user.organizationId,
      parsed.data,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/requisitions/[reqId]]");
  }
}
