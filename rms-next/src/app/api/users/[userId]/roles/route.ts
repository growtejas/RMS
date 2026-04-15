import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { assignRoleToUser } from "@/lib/services/user-admin-write-service";
import { assignRoleBody } from "@/lib/validators/user-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { userId: string } };

/** POST /api/users/{userId}/roles */
export async function POST(request: Request, { params }: Ctx) {
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

    const parsed = await parseFastapiJsonBody(request, assignRoleBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await assignRoleToUser(userId, parsed.data.role_name);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/users/[userId]/roles]");
  }
}
