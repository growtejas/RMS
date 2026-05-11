import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import {
  isCanonicalListRequest,
  paginateInMemory,
} from "@/lib/pagination/in-memory";
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
    const url = new URL(req.url);
    if (isCanonicalListRequest(url)) {
      return paginateInMemory(url, data);
    }
    const res = NextResponse.json(data);
    res.headers.set("Deprecation", "list-hr-skills-summary-bare-shape");
    return res;
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/hr/skills-summary]");
  }
}
