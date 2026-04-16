import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getInboundEventMetrics } from "@/lib/services/inbound-events-metrics-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ingest/metrics — inbound event queue + lifecycle counters. */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "HR", "TA");
    if (denied) {
      return denied;
    }

    const metrics = await getInboundEventMetrics();
    return NextResponse.json(metrics);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/ingest/metrics]");
  }
}
