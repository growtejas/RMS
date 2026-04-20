import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { listMyRequisitionsRead } from "@/lib/services/requisitions-read-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/requisitions/my */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(
      user,
      "Manager",
      "Admin",
      "HR",
      "Employee",
      "TA",
    );
    if (denied) {
      return denied;
    }

    const data = await listMyRequisitionsRead(
      user.organizationId,
      user.userId,
    );
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/requisitions/my]");
  }
}
