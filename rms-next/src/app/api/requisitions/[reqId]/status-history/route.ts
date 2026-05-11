import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { withRequestPerf } from "@/lib/perf/request-perf";
import {
  countRequisitionStatusHistory,
  listRequisitionStatusHistoryForApi,
} from "@/lib/repositories/requisitions-read";
import { assertRequisitionInOrganization } from "@/lib/tenant/org-assert";
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

/**
 * GET /api/requisitions/{req_id}/status-history — parity with FastAPI
 * `list_requisition_status_history`.
 */
export async function GET(req: Request, { params }: Ctx) {
  return withRequestPerf(
    "GET /api/requisitions/[reqId]/status-history",
    async () => {
      try {
        const user = await requireBearerUser(req);
        if (user instanceof NextResponse) {
          return user;
        }
        const denied = requireAnyRole(
          user,
          "Manager",
          "Admin",
          "HR",
          "Employee",
          "TA",
        );
        if (denied) {
          return denied;
        }

        const reqId = parseReqId(params);
        if (reqId instanceof NextResponse) {
          return reqId;
        }

        const url = new URL(req.url);
        await assertRequisitionInOrganization(reqId, user.organizationId);

        const rawCanonicalLimit = url.searchParams.get("limit");
        const isCanonicalRequest =
          rawCanonicalLimit != null &&
          (() => {
            const parsed = Number.parseInt(rawCanonicalLimit, 10);
            return (
              Number.isFinite(parsed) &&
              (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
            );
          })();

        if (isCanonicalRequest) {
          const { page, limit } = parsePaginationParams(url);
          const offset = (page - 1) * limit;
          const [items, total] = await Promise.all([
            listRequisitionStatusHistoryForApi(reqId, { limit, offset }),
            countRequisitionStatusHistory(reqId),
          ]);
          return paginatedJson(items, { page, limit, total });
        }

        const pageRaw = url.searchParams.get("page");
        const pageSizeRaw = url.searchParams.get("page_size");
        const page =
          pageRaw != null && pageRaw !== ""
            ? Number.parseInt(pageRaw, 10)
            : 1;
        const pageSize =
          pageSizeRaw != null && pageSizeRaw !== ""
            ? Number.parseInt(pageSizeRaw, 10)
            : 50;
        if (!Number.isFinite(page) || page <= 0) {
          return NextResponse.json({ detail: "Invalid page" }, { status: 422 });
        }
        if (!Number.isFinite(pageSize) || pageSize <= 0) {
          return NextResponse.json(
            { detail: "Invalid page_size" },
            { status: 422 },
          );
        }

        const limit = Math.min(Math.max(pageSize, 1), 200);
        const offset = (page - 1) * limit;
        const data = await listRequisitionStatusHistoryForApi(reqId, {
          limit,
          offset,
        });
        const res = NextResponse.json(data);
        res.headers.set("Deprecation", "list-status-history-bare-shape");
        return res;
      } catch (e) {
        return referenceWriteCatch(
          e,
          "[GET /api/requisitions/[reqId]/status-history]",
        );
      }
    },
  );
}

/**
 * POST — FastAPI returns 403 (manual history disabled). Match that contract.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager", "Admin", "HR");
    if (denied) {
      return denied;
    }

    const rid = parseReqId(params);
    if (rid instanceof NextResponse) {
      return rid;
    }
    return NextResponse.json(
      {
        detail:
          "Manual status history creation is disabled. History is recorded automatically by workflow operations.",
      },
      { status: 403 },
    );
  } catch (e) {
    return referenceWriteCatch(
      e,
      "[POST /api/requisitions/[reqId]/status-history]",
    );
  }
}
