import { NextResponse } from "next/server";

function getConfiguredToken(): string | null {
  const t = process.env.METRICS_BEARER_TOKEN?.trim();
  return t ? t : null;
}

function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m?.[1]) return m[1].trim();
  const alt = req.headers.get("x-metrics-token") ?? "";
  return alt.trim() || null;
}

/**
 * Protects internal endpoints (metrics/health).
 *
 * - In production: requires `METRICS_BEARER_TOKEN` to be set and presented.
 * - In non-production: allows unauthenticated access to reduce local friction,
 *   unless `METRICS_BEARER_TOKEN` is configured (then it is enforced).
 */
export function requireMetricsAuth(req: Request): NextResponse | null {
  const configured = getConfiguredToken();
  const isProd = process.env.NODE_ENV === "production";

  if (!configured) {
    if (isProd) {
      return NextResponse.json(
        { detail: "Metrics auth not configured" },
        { status: 503 },
      );
    }
    return null;
  }

  const presented = extractToken(req);
  if (!presented || presented !== configured) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }
  return null;
}

