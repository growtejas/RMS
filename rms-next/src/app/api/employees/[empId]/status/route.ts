import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { patchEmployeeStatus } from "@/lib/services/employees-service";
import { employeeStatusBody } from "@/lib/validators/employees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { empId: string } };

/** PATCH /api/employees/{empId}/status */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(req, employeeStatusBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await patchEmployeeStatus(
      params.empId,
      parsed.data.emp_status,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/employees/[empId]/status]");
  }
}
