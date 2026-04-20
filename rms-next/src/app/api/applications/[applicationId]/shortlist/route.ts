import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { shortlistApplicationJson } from "@/lib/services/applications-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { applicationId: string } };

function parseId(s: string): number | NextResponse {
  const id = Number.parseInt(s, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ detail: "Invalid application id" }, { status: 422 });
  }
  return id;
}

/** POST /api/applications/{applicationId}/shortlist — set pipeline stage to Shortlisted. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin");
    if (denied) {
      return denied;
    }

    const applicationId = parseId(params.applicationId);
    if (applicationId instanceof NextResponse) {
      return applicationId;
    }

    const data = await shortlistApplicationJson(applicationId, user, user.roles);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/applications/[applicationId]/shortlist]");
  }
}
