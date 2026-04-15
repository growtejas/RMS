import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { validateEmployees } from "@/lib/services/employees-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/employees/validate?emp_id=&work_email= */
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

    const url = new URL(req.url);
    const empId = url.searchParams.get("emp_id");
    const workEmail = url.searchParams.get("work_email");

    const body = await validateEmployees(empId, workEmail);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/employees/validate]");
  }
}
