import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { endAssignment } from "@/lib/services/org-assignment-service";
import { assignmentEndBody } from "@/lib/validators/org-assignments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { assignmentId: string } };

/**
 * PATCH /api/assignments/{assignmentId}/end
 * FastAPI had no auth on this route; Next requires Bearer + HR/Admin/Manager.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const assignmentId = Number.parseInt(params.assignmentId, 10);
    if (!Number.isFinite(assignmentId)) {
      return NextResponse.json({ detail: "Invalid assignment id" }, { status: 422 });
    }

    const parsed = await parseFastapiJsonBody(request, assignmentEndBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const data = await endAssignment(assignmentId, parsed.data.end_date);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/assignments/[assignmentId]/end]");
  }
}
