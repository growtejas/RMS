import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeOk } from "@/lib/http/api-envelope";
import { listMyInterviewsAsPanelistJson } from "@/lib/services/interviews-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/interviews/my — interviews where the current user is a linked panelist. */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Interviewer");
    if (denied) {
      return denied;
    }

    const interviews = await listMyInterviewsAsPanelistJson(user);
    return envelopeOk({ interviews });
  } catch (e) {
    return envelopeCatch(e, "[GET /api/interviews/my]");
  }
}
