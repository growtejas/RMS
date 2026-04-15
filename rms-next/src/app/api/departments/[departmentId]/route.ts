import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  removeDepartment,
  updateDepartment,
} from "@/lib/services/reference-write-service";
import { departmentUpdateBody } from "@/lib/validators/reference-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { departmentId: string } };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner");
    if (denied) {
      return denied;
    }

    const departmentId = Number.parseInt(params.departmentId, 10);
    if (!Number.isFinite(departmentId)) {
      return NextResponse.json({ detail: "Invalid department id" }, { status: 422 });
    }

    const parsed = await parseFastapiJsonBody(request, departmentUpdateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await updateDepartment(
      user.userId,
      departmentId,
      parsed.data.department_name,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/departments/[departmentId]]");
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner");
    if (denied) {
      return denied;
    }

    const departmentId = Number.parseInt(params.departmentId, 10);
    if (!Number.isFinite(departmentId)) {
      return NextResponse.json({ detail: "Invalid department id" }, { status: 422 });
    }

    const body = await removeDepartment(user.userId, departmentId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[DELETE /api/departments/[departmentId]]");
  }
}
