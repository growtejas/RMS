import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getAtsFunnelForOrganization } from "@/lib/services/ats-funnel-report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const funnel = await getAtsFunnelForOrganization(user.organizationId);
    return NextResponse.json({ organization_id: user.organizationId, funnel });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/reports/ats-funnel]");
  }
}
