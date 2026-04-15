import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { adminListUsers } from "@/lib/repositories/users-directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/users — parity with FastAPI `GET /api/admin/users/`. */
export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner");
    if (denied) {
      return denied;
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search");

    const data = await adminListUsers(search);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/admin/users]");
  }
}
