import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import {
  deleteContactApi,
  getContactApi,
} from "@/lib/services/employee-satellites-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { empId: string; contactType: string } };

/** GET /api/employees/{empId}/contacts/{contactType} */
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

    const contactType = decodeURIComponent(params.contactType);
    const body = await getContactApi(params.empId, contactType);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(
      e,
      "[GET /api/employees/[empId]/contacts/[contactType]]",
    );
  }
}

/** DELETE /api/employees/{empId}/contacts/{contactType} */
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

    const contactType = decodeURIComponent(params.contactType);
    const body = await deleteContactApi(params.empId, contactType);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(
      e,
      "[DELETE /api/employees/[empId]/contacts/[contactType]]",
    );
  }
}
