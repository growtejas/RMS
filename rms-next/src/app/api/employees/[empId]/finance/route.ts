import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  getFinanceApi,
  upsertFinanceApi,
} from "@/lib/services/employee-satellites-service";
import { employeeFinanceUpsertBody } from "@/lib/validators/employee-satellites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { empId: string } };

/** GET /api/employees/{empId}/finance */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin");
    if (denied) {
      return denied;
    }

    const body = await getFinanceApi(params.empId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/employees/[empId]/finance]");
  }
}

/** POST /api/employees/{empId}/finance */
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

    const parsed = await parseFastapiJsonBody(req, employeeFinanceUpsertBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await upsertFinanceApi(params.empId, parsed.data);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/employees/[empId]/finance]");
  }
}
