import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getTransitionStats } from "@/lib/services/workflow-audit-read-service";
import { referenceWriteCatch } from "@/lib/api/reference-write-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workflow/stats/transitions */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "HR");
    if (denied) {
      return denied;
    }

    const url = new URL(req.url);
    const rawDays = Number.parseInt(url.searchParams.get("days") ?? "7", 10);
    const days = Math.min(90, Math.max(1, Number.isFinite(rawDays) ? rawDays : 7));

    const stats = await getTransitionStats({ days });
    return NextResponse.json(stats);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/workflow/stats/transitions]");
  }
}
