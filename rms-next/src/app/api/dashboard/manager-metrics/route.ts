import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { buildManagerMetricsBundle } from "@/lib/repositories/dashboard-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/dashboard/manager-metrics */
export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager");
    if (denied) {
      return denied;
    }

    const slaDays = Number.parseInt(
      process.env.MANAGER_SLA_DAYS ?? "30",
      10,
    );
    const days = Number.isFinite(slaDays) ? slaDays : 30;

    const data = await buildManagerMetricsBundle(user.organizationId, days);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/dashboard/manager-metrics]");
  }
}
