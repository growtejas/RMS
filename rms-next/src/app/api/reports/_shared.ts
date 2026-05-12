import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser, type ApiUser } from "@/lib/auth/api-guard";
import { getInterviewerScope } from "@/lib/auth/interviewer-scope";
import { envelopeCatch, envelopeOk } from "@/lib/http/api-envelope";
import { log } from "@/lib/logging/logger";
import type { ReportFilters } from "@/lib/reports/types";

export async function requireReportsUser(req: Request): Promise<ApiUser | NextResponse> {
  const user = await requireBearerUser(req);
  if (user instanceof NextResponse) return user;
  const denied = requireAnyRole(user, "TA", "HR", "Manager", "Employee", "Interviewer", "Owner");
  if (denied) return denied;
  if (user.roles.some((role) => role.toLowerCase() === "admin")) {
    return NextResponse.json(
      { detail: "Access denied. Hiring Intelligence is not available for Admin role." },
      { status: 403 },
    );
  }
  return user;
}

export function reportCacheHeaders(extra?: Record<string, string>) {
  return {
    "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
    "X-Report-Source": "live",
    ...extra,
  };
}

const SLOW_REPORT_THRESHOLD_MS = 1500;

export interface WithReportHandlerOptions {
  /** Stable route identifier for logging/metrics. */
  routeName?: string;
  /** Override for cache TTL when a route serves more volatile data. */
  cacheControl?: string;
}

export async function applyInterviewerReportScope(
  user: ApiUser,
  filters: ReportFilters,
): Promise<ReportFilters> {
  const scope = await getInterviewerScope(user);
  if (!scope.interviewerOnly) {
    return filters;
  }
  const allowedReqIds = Array.from(scope.requisitionIds);
  if (allowedReqIds.length === 0) {
    return { ...filters, requisitionIds: [-1] };
  }
  if (filters.requisitionIds.length === 0) {
    return { ...filters, requisitionIds: allowedReqIds };
  }
  const allowedSet = new Set(allowedReqIds);
  return {
    ...filters,
    requisitionIds: filters.requisitionIds.filter((id) => allowedSet.has(id)),
  };
}

export async function withReportHandler<T>(
  req: Request,
  resolve: (ctx: { user: ApiUser; url: URL }) => Promise<T>,
  options: WithReportHandlerOptions = {},
) {
  const start = performance.now();
  const routeName = options.routeName ?? new URL(req.url).pathname;
  try {
    const user = await requireReportsUser(req);
    if (user instanceof NextResponse) return user;
    const data = await resolve({ user, url: new URL(req.url) });
    const elapsed = Math.round(performance.now() - start);
    if (elapsed > SLOW_REPORT_THRESHOLD_MS) {
      log("warn", "[reports-api] slow report", { route: routeName, elapsedMs: elapsed });
    }
    return envelopeOk(data, {
      headers: {
        ...reportCacheHeaders(options.cacheControl ? { "Cache-Control": options.cacheControl } : undefined),
        "Server-Timing": `report;dur=${elapsed}`,
      },
    });
  } catch (e) {
    return envelopeCatch(e, `[reports-api:${routeName}]`);
  }
}
