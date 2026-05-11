import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { ROLE_CATALOG } from "@/lib/services/cie/role-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cie/role-catalog — canonical role master for CIE talent discovery (read-only). */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }
    void req;
    return NextResponse.json({ roles: ROLE_CATALOG });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/cie/role-catalog]");
  }
}
