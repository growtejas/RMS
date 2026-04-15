import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  deleteEducationApi,
  updateEducationApi,
} from "@/lib/services/employee-satellites-service";
import { employeeEducationUpdateBody } from "@/lib/validators/employee-satellites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { empId: string; eduId: string } };

/** PATCH /api/employees/{empId}/education/{eduId} */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "Employee");
    if (denied) {
      return denied;
    }

    const eduId = Number.parseInt(params.eduId, 10);
    if (!Number.isFinite(eduId)) {
      return NextResponse.json({ detail: "Invalid education id" }, { status: 422 });
    }

    const parsed = await parseFastapiJsonBody(req, employeeEducationUpdateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await updateEducationApi(params.empId, eduId, parsed.data);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(
      e,
      "[PATCH /api/employees/[empId]/education/[eduId]]",
    );
  }
}

/** DELETE /api/employees/{empId}/education/{eduId} */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "Employee");
    if (denied) {
      return denied;
    }

    const eduId = Number.parseInt(params.eduId, 10);
    if (!Number.isFinite(eduId)) {
      return NextResponse.json({ detail: "Invalid education id" }, { status: 422 });
    }

    const body = await deleteEducationApi(params.empId, eduId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(
      e,
      "[DELETE /api/employees/[empId]/education/[eduId]]",
    );
  }
}
