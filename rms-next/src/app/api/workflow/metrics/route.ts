import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getMergedWorkflowMetrics } from "@/lib/workflow/workflow-metrics-merged";
import { referenceWriteCatch } from "@/lib/api/reference-write-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workflow/metrics */
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

    const m = await getMergedWorkflowMetrics();
    return NextResponse.json({
      total_transitions: m.total_transitions,
      total_successes: m.total_successes,
      total_failures: m.total_failures,
      total_conflicts: m.total_conflicts,
      success_rate: m.success_rate,
      avg_duration_ms: m.avg_duration_ms,
      uptime_seconds: m.uptime_seconds,
      start_time: m.start_time,
      transitions: m.transitions,
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/workflow/metrics]");
  }
}
