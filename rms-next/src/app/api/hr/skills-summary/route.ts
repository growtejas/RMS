import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { listHrSkillsSummary } from "@/lib/services/hr-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hr/skills-summary — parity with FastAPI `GET /api/hr/skills-summary`. */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin");
    if (denied) {
      return denied;
    }

    const data = await listHrSkillsSummary();
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/hr/skills-summary]");
  }
}
