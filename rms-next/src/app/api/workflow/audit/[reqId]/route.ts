import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getRequisitionAuditLog } from "@/lib/services/workflow-audit-read-service";
import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { parsePaginationParams } from "@/lib/pagination/zod";
import { paginatedJson } from "@/lib/pagination/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { reqId: string } };

function parseReqId(params: { reqId: string }): number | NextResponse {
  const reqId = Number.parseInt(params.reqId, 10);
  if (!Number.isFinite(reqId)) {
    return NextResponse.json({ detail: "Invalid requisition id" }, { status: 422 });
  }
  return reqId;
}

function isCanonicalListRequest(url: URL): boolean {
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit == null) return false;
  const parsed = Number.parseInt(rawLimit, 10);
  return (
    Number.isFinite(parsed) &&
    (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
  );
}

function parseLegacyParams(url: URL): {
  page: number;
  pageSize: number;
  includeItems: boolean;
} {
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  );
  const rawSize = Number.parseInt(url.searchParams.get("page_size") ?? "50", 10) || 50;
  const pageSize = Math.min(200, Math.max(1, rawSize));
  const includeItems = url.searchParams.get("include_items") !== "false";
  return { page, pageSize, includeItems };
}

/** GET /api/workflow/audit/{req_id} — FastAPI parity. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "HR", "Manager");
    if (denied) {
      return denied;
    }

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    const url = new URL(req.url);
    const includeItems = url.searchParams.get("include_items") !== "false";

    if (isCanonicalListRequest(url)) {
      const { page, limit } = parsePaginationParams(url);
      const result = await getRequisitionAuditLog({
        reqId,
        includeItems,
        page,
        pageSize: limit,
      });
      if (result.notFound) {
        return NextResponse.json(
          { detail: "Requisition not found" },
          { status: 404 },
        );
      }
      return paginatedJson(result.entries, {
        page: result.page,
        limit,
        total: result.total,
      });
    }

    const { page, pageSize } = parseLegacyParams(url);
    const result = await getRequisitionAuditLog({
      reqId,
      includeItems,
      page,
      pageSize,
    });

    if (result.notFound) {
      return NextResponse.json({ detail: "Requisition not found" }, { status: 404 });
    }

    const res = NextResponse.json({
      total: result.total,
      page: result.page,
      page_size: result.page_size,
      entries: result.entries,
    });
    res.headers.set("Deprecation", "list-workflow-audit-legacy-shape");
    return res;
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/workflow/audit/reqId]");
  }
}
