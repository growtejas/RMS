import { NextResponse } from "next/server";

import {
  getMetricsContentType,
  renderQueueMetricsAsPrometheusText,
} from "@/lib/metrics/queue-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 8 - Prometheus scrape endpoint for the web tier.
 *
 * Protected by `METRICS_BEARER_TOKEN` (required in production). Returns
 * BullMQ queue depth + Node default metrics so the on-call dashboards
 * can plot pool saturation and queue lag.
 *
 * Note: workers run their own scrape endpoint via prom-client when
 * launched standalone; this route covers the web fleet only.
 */
export async function GET(req: Request) {
  const expected = process.env.METRICS_BEARER_TOKEN?.trim();
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    const sent = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (sent !== expected) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Refuse to expose metrics in prod without auth.
    return NextResponse.json(
      { detail: "Metrics endpoint requires METRICS_BEARER_TOKEN in production" },
      { status: 503 },
    );
  }

  const body = await renderQueueMetricsAsPrometheusText();
  return new Response(body, {
    headers: {
      "Content-Type": getMetricsContentType(),
      "Cache-Control": "no-store",
    },
  });
}
