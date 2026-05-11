import { NextResponse } from "next/server";

import { log } from "@/lib/logging/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 8 - browser RUM ingestion.
 *
 * Receives a single Web Vitals sample (LCP, INP, CLS, TTFB, FCP) from
 * the `next/web-vitals` reporter wired in the providers layer. We log
 * it as a structured event so dashboards can roll it up alongside
 * server-side `perf_request_summary` lines.
 *
 * Auth-free on purpose: this is best-effort observability, paid for by
 * the user's existing browser session. Aggregations are anonymous.
 *
 * Payload format (matches the `Metric` interface from `web-vitals`):
 *   { name, value, rating, id, navigationType, route, ts }
 */
type RumPayload = {
  name?: string;
  value?: number;
  rating?: string;
  id?: string;
  navigationType?: string;
  route?: string;
  ts?: number;
  /** Optional: hydration ms from `performance.getEntriesByType('navigation')`. */
  hydration_ms?: number;
};

function isNumeric(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export async function POST(req: Request) {
  let body: RumPayload | null = null;
  try {
    body = (await req.json()) as RumPayload;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  // Defensive: cap log volume by validating field shapes before accepting.
  log("info", "rum_web_vitals", {
    metric_name: typeof body.name === "string" ? body.name : "unknown",
    metric_value: isNumeric(body.value) ? body.value : null,
    metric_rating: typeof body.rating === "string" ? body.rating : null,
    metric_id: typeof body.id === "string" ? body.id : null,
    navigation_type:
      typeof body.navigationType === "string" ? body.navigationType : null,
    route: typeof body.route === "string" ? body.route : null,
    hydration_ms: isNumeric(body.hydration_ms) ? body.hydration_ms : null,
    user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
  });
  return NextResponse.json({ ok: true });
}
