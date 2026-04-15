import { NextResponse } from "next/server";

import {
  getMergedWorkflowMetrics,
  mergedMetricsToPrometheus,
} from "@/lib/workflow/workflow-metrics-merged";
import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireMetricsAuth } from "@/lib/internal/metrics-auth";
import { getRequestId } from "@/lib/http/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workflow/metrics/prometheus — protected (token or network). */
export async function GET(req: Request) {
  try {
    const denied = requireMetricsAuth(req);
    if (denied) return denied;
    const m = await getMergedWorkflowMetrics();
    const body = mergedMetricsToPrometheus(m);
    const res = new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
    const reqId = getRequestId(req);
    if (reqId) res.headers.set("x-request-id", reqId);
    return res;
  } catch (e) {
    return referenceWriteCatch(
      e,
      "[GET /api/workflow/metrics/prometheus]",
      getRequestId(req),
    );
  }
}
