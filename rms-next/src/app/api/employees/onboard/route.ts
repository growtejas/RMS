import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { onboardEmployee } from "@/lib/services/employees-service";
import { employeeOnboardBody } from "@/lib/validators/employees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/employees/onboard */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(req, employeeOnboardBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await onboardEmployee(parsed.data);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/employees/onboard]");
  }
}
