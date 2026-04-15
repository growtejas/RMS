import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { listHrEmployeeProfiles } from "@/lib/services/hr-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hr/employees — parity with FastAPI `GET /api/hr/employees`. */
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

    const data = await listHrEmployeeProfiles();
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/hr/employees]");
  }
}
