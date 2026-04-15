import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { completeEmployeeOnboarding } from "@/lib/services/employees-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { empId: string } };

/** POST /api/employees/{empId}/complete-onboarding */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin");
    if (denied) {
      return denied;
    }

    const body = await completeEmployeeOnboarding(params.empId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(
      e,
      "[POST /api/employees/[empId]/complete-onboarding]",
    );
  }
}
