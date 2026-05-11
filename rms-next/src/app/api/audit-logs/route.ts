import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { withRequestPerf } from "@/lib/perf/request-perf";
import {
  countAuditLogs,
  listAuditLogsForApi,
} from "@/lib/repositories/audit-logs-read";
import { createGenericAuditLog } from "@/lib/services/user-admin-write-service";
import { auditLogCreateBody } from "@/lib/validators/user-admin";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { parsePaginationParams } from "@/lib/pagination/zod";
import { paginatedJson } from "@/lib/pagination/server";

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
    page: url.searchParams.get("page"),
    pageSize: url.searchParams.get("page_size"),
  };
}

function isCanonicalListRequest(url: URL): boolean {
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit != null) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (
      Number.isFinite(parsed) &&
      (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * GET /api/audit-logs — parity with FastAPI list (JSON shape).
 * Requires auth; FastAPI had no auth on this route — we restrict to operational roles.
 */
export async function GET(request: Request) {
  return withRequestPerf("GET /api/audit-logs", async () => {
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

      const url = new URL(request.url);
      const filters = parseFilters(request);
      if (isCanonicalListRequest(url)) {
        const { page, limit } = parsePaginationParams(url);
        const [items, total] = await Promise.all([
          listAuditLogsForApi({ ...filters, page, pageSize: limit }),
          countAuditLogs(filters),
        ]);
        return paginatedJson(items, { page, limit, total });
      }
      const data = await listAuditLogsForApi(filters);
      const res = NextResponse.json(data);
      res.headers.set("Deprecation", "list-audit-logs-bare-shape");
      return res;
    } catch (e) {
      return referenceWriteCatch(e, "[GET /api/audit-logs]", request);
    }
  });
}

/** POST /api/audit-logs — parity with FastAPI create audit row. */
export async function POST(request: Request) {
  return withRequestPerf("POST /api/audit-logs", async () => {
    try {
      const user = await requireBearerUser(request);
      if (user instanceof NextResponse) {
        return user;
      }
      const denied = requireAnyRole(user, "Admin", "Owner", "HR");
      if (denied) {
        return denied;
      }

      const parsed = await parseFastapiJsonBody(request, auditLogCreateBody);
      if (!parsed.ok) {
        return parsed.response;
      }

      const d = parsed.data;
      const body = await createGenericAuditLog({
        entityName: d.entity_name,
        entityId: d.entity_id ?? null,
        action: d.action,
        performedBy: d.performed_by ?? null,
        targetUserId: d.target_user_id ?? null,
        oldValue: d.old_value ?? null,
        newValue: d.new_value ?? null,
      });
      return NextResponse.json(body);
    } catch (e) {
      return referenceWriteCatch(e, "[POST /api/audit-logs]", request);
    }
  });
}
