import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getHrPendingApprovalsList } from "@/lib/repositories/dashboard-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/dashboard/hr/pending-approvals */
export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin");
    if (denied) {
      return denied;
    }

    const data = await getHrPendingApprovalsList();
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/dashboard/hr/pending-approvals]");
  }
}
