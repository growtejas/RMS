import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import { issueCandidatePortalToken } from "@/lib/services/candidate-portal-token-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  application_id: z.number().int().positive(),
  ttl_hours: z.number().int().positive().max(168).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin");
    if (denied) {
      return denied;
    }
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const token = await issueCandidatePortalToken({
      applicationId: parsed.data.application_id,
      organizationId: user.organizationId,
      ttlHours: parsed.data.ttl_hours,
    });
    return NextResponse.json(token, { status: 201 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/candidate-portal/tokens]");
  }
}
