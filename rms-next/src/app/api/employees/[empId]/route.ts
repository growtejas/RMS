import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  getEmployee,
  updateEmployee,
} from "@/lib/services/employees-service";
import { employeeUpdateBody } from "@/lib/validators/employees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { empId: string } };

/** GET /api/employees/{empId} */
export async function GET(req: Request, { params }: Ctx) {
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
    );
    if (denied) {
      return denied;
    }

    const body = await getEmployee(params.empId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/employees/[empId]]");
  }
}

/** PATCH /api/employees/{empId} */
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

    const parsed = await parseFastapiJsonBody(req, employeeUpdateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await updateEmployee(params.empId, parsed.data);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/employees/[empId]]");
  }
}
