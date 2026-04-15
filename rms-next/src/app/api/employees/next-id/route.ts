import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getNextEmployeeId } from "@/lib/services/employees-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/employees/next-id */
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

    const body = await getNextEmployeeId();
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/employees/next-id]");
  }
}
