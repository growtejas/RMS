import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { linkUserToEmployee } from "@/lib/services/user-admin-write-service";
import { linkUserEmployeeBody } from "@/lib/validators/user-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/users/link-employee */
export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(request, linkUserEmployeeBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await linkUserToEmployee(
      parsed.data.user_id,
      parsed.data.emp_id,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/users/link-employee]");
  }
}
