import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { patchApplicationStageJson } from "@/lib/services/applications-service";
import { applicationStageBody } from "@/lib/validators/candidates";

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

/** PATCH /api/applications/{application_id}/stage */
export async function PATCH(req: Request, { params }: Ctx) {
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

    const parsed = await parseFastapiJsonBody(req, applicationStageBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const data = await patchApplicationStageJson(
      applicationId,
      parsed.data.new_stage,
      parsed.data.reason,
      user,
      user.roles,
    );
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/applications/[applicationId]/stage]");
  }
}
