import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { deleteSkillApi } from "@/lib/services/employee-satellites-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { empId: string; skillId: string } };

/** DELETE /api/employees/{empId}/skills/{skillId} */
export async function DELETE(req: Request, { params }: Ctx) {
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

    const skillId = Number.parseInt(params.skillId, 10);
    if (!Number.isFinite(skillId)) {
      return NextResponse.json({ detail: "Invalid skill id" }, { status: 422 });
    }

    const body = await deleteSkillApi(params.empId, skillId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(
      e,
      "[DELETE /api/employees/[empId]/skills/[skillId]]",
    );
  }
}
