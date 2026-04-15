import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  listSkillsApi,
  upsertSkillApi,
} from "@/lib/services/employee-satellites-service";
import { employeeSkillUpsertBody } from "@/lib/validators/employee-satellites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { empId: string } };

/** GET /api/employees/{empId}/skills */
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
      "TA",
    );
    if (denied) {
      return denied;
    }

    const data = await listSkillsApi(params.empId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/employees/[empId]/skills]");
  }
}

/** POST /api/employees/{empId}/skills */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "Employee");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(req, employeeSkillUpsertBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await upsertSkillApi(params.empId, parsed.data);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/employees/[empId]/skills]");
  }
}
