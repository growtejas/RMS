import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { ensureAssignableRoles } from "@/lib/repositories/users-directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/users/roles/catalog — parity with FastAPI. */
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

    const names = await ensureAssignableRoles();
    return NextResponse.json(names);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/admin/users/roles/catalog]");
  }
}
