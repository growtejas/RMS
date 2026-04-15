import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { summarizeAuditLogs } from "@/lib/repositories/audit-logs-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilters(req: Request) {
  const url = new URL(req.url);
  return {
    entityName: url.searchParams.get("entity_name"),
    entityId: url.searchParams.get("entity_id"),
    search: url.searchParams.get("search"),
    dateFrom: url.searchParams.get("date_from"),
    dateTo: url.searchParams.get("date_to"),
    userId: url.searchParams.get("user_id"),
    action: url.searchParams.get("action"),
  };
}

/** GET /api/audit-logs/summary */
export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(
      user,
      "Admin",
      "Owner",
      "HR",
      "TA",
      "Manager",
    );
    if (denied) {
      return denied;
    }

    const data = await summarizeAuditLogs(parseFilters(request));
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/audit-logs/summary]");
  }
}
