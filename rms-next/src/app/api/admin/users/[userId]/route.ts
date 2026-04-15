import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  adminDeactivateUser,
  adminUpdateUser,
} from "@/lib/services/user-admin-write-service";
import { userAdminUpdateBody } from "@/lib/validators/user-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { userId: string } };

/** PUT /api/admin/users/{userId} */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner");
    if (denied) {
      return denied;
    }

    const userId = Number.parseInt(params.userId, 10);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ detail: "Invalid user id" }, { status: 422 });
    }

    const parsed = await parseFastapiJsonBody(request, userAdminUpdateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await adminUpdateUser(user.userId, userId, {
      roles: parsed.data.roles,
      is_active: parsed.data.is_active,
      employee_id: parsed.data.employee_id,
    });
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[PUT /api/admin/users/[userId]]");
  }
}

/** DELETE /api/admin/users/{userId} — soft deactivate */
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

    const userId = Number.parseInt(params.userId, 10);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ detail: "Invalid user id" }, { status: 422 });
    }

    const body = await adminDeactivateUser(user.userId, userId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[DELETE /api/admin/users/[userId]]");
  }
}
