import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { listEmployees } from "@/lib/services/employees-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/employees/employees — parity with FastAPI list. */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(
      user,
      "HR",
      "Admin",
      "Manager",
      "Employee",
      "TA",
    );
    if (denied) {
      return denied;
    }

    const data = await listEmployees();
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/employees/employees]");
  }
}
