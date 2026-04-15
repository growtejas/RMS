import { NextResponse } from "next/server";

import { getLastTransitionTime } from "@/lib/services/workflow-audit-read-service";
import { getMergedWorkflowMetrics } from "@/lib/workflow/workflow-metrics-merged";
import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireMetricsAuth } from "@/lib/internal/metrics-auth";
import { getRequestId } from "@/lib/http/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workflow/health — protected (token or network). */
export async function GET(req: Request) {
  try {
    const denied = requireMetricsAuth(req);
    if (denied) return denied;
    const metrics = await getMergedWorkflowMetrics();
    const successRate = metrics.success_rate;
    const total = metrics.total_transitions;
    const conflicts = metrics.total_conflicts;

    const issues: string[] = [];
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (successRate < 90) {
      issues.push(`Low success rate: ${successRate}%`);
      status = "degraded";
    }
    if (successRate < 50) {
      status = "unhealthy";
    }

    if (total > 0) {
      const conflictRate = (conflicts / total) * 100;
      if (conflictRate > 10) {
        issues.push(`High conflict rate: ${conflictRate.toFixed(1)}%`);
        if (status === "healthy") {
          status = "degraded";
        }
      }
    }

    const last = await getLastTransitionTime();

    const res = NextResponse.json({
      status,
      total_transitions: total,
      recent_success_rate: successRate,
      recent_conflicts: conflicts,
      last_transition: last?.toISOString() ?? null,
      issues,
    });
    const reqId = getRequestId(req);
    if (reqId) res.headers.set("x-request-id", reqId);
    return res;
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/workflow/health]", getRequestId(req));
  }
}
