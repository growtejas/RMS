import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getHrEmployeeProfile } from "@/lib/services/hr-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { empId: string } };

/** GET /api/hr/employees/{emp_id} — parity with FastAPI `GET /api/hr/employees/{emp_id}`. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const { empId } = ctx.params;
    const data = await getHrEmployeeProfile(empId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/hr/employees/[empId]]");
  }
}
