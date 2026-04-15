import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { getDepartmentsCatalog } from "@/lib/services/reference-read-service";
import { createDepartment } from "@/lib/services/reference-write-service";
import { departmentCreateBody } from "@/lib/validators/reference-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/departments — parity with FastAPI `GET /api/departments/`. */
export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR", "Manager");
    if (denied) {
      return denied;
    }

    const data = await getDepartmentsCatalog();
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/departments]");
  }
}

/** POST /api/departments — parity with FastAPI `POST /api/departments/`. */
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

    const parsed = await parseFastapiJsonBody(request, departmentCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await createDepartment(user.userId, parsed.data.department_name);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/departments]");
  }
}
