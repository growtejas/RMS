import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import { patchApplicationOfferMetaJson } from "@/lib/services/applications-service";
import { applicationOfferMetaPatchBody } from "@/lib/validators/application-offer-meta";

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

/** PATCH /api/applications/{application_id}/offer-meta */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const applicationId = parseId(params.applicationId);
    if (applicationId instanceof NextResponse) {
      return applicationId;
    }

    const parsed = await parseJsonBody(req, applicationOfferMetaPatchBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const data = await patchApplicationOfferMetaJson(
      applicationId,
      user.organizationId,
      parsed.data.offer_meta,
    );
    if (!data) {
      return NextResponse.json({ detail: "Application not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/applications/.../offer-meta]");
  }
}
