import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeOk } from "@/lib/http/api-envelope";
import { listManagerInterviewsJson } from "@/lib/services/interviews-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/manager/interviews */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager", "Admin");
    if (denied) {
      return denied;
    }

    const interviews = await listManagerInterviewsJson(user);
    return envelopeOk({ interviews });
  } catch (e) {
    return envelopeCatch(e, "[GET /api/manager/interviews]");
  }
}

