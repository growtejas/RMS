import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
} from "@/lib/pagination/contract";
import { paginatedJson } from "@/lib/pagination/server";
import {
  createRequisitionItemNonWorkflow,
  listRequisitionItemsJson,
} from "@/lib/services/requisitions-write-service";
import { requisitionItemCreateBody } from "@/lib/validators/requisition-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { reqId: string } };

const PAGE_SIZE_NUMS = new Set<number>(PAGE_SIZE_OPTIONS);

function parseReqId(params: { reqId: string }): number | NextResponse {
  const reqId = Number.parseInt(params.reqId, 10);
  if (!Number.isFinite(reqId)) {
    return NextResponse.json({ detail: "Invalid requisition id" }, { status: 422 });
  }
  return reqId;
}

/**
 * GET /api/requisitions/{reqId}/items
 *
 * Returns the canonical paginated envelope when `?page=` or `?limit=`
 * (canonical 25/50/100) is supplied; otherwise emits the legacy bare array
 * for backwards compatibility. The full list per requisition is small
 * (typically under 50 rows) so server-side filtering is a future concern.
 */
export async function GET(req: Request, { params }: Ctx) {
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

    const items = await listRequisitionItemsJson(reqId, user.organizationId);

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limitNum = limitRaw != null ? Number.parseInt(limitRaw, 10) : NaN;
    const useCanonical =
      url.searchParams.has("page") ||
      (Number.isFinite(limitNum) && PAGE_SIZE_NUMS.has(limitNum));

    if (useCanonical) {
      const limit = Number.isFinite(limitNum) && PAGE_SIZE_NUMS.has(limitNum)
        ? limitNum
        : DEFAULT_PAGE_SIZE;
      const pageRaw = url.searchParams.get("page");
      const pageReq = pageRaw != null ? Number.parseInt(pageRaw, 10) : 1;
      const page = Number.isFinite(pageReq) && pageReq > 0 ? pageReq : 1;
      const start = (page - 1) * limit;
      const slice = items.slice(start, start + limit);
      return paginatedJson(slice, { page, limit, total: items.length });
    }

    return NextResponse.json(items);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/requisitions/[reqId]/items]");
  }
}

/**
 * POST /api/requisitions/{reqId}/items — create item without workflow recalculate (Phase D).
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

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    const parsed = await parseFastapiJsonBody(req, requisitionItemCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await createRequisitionItemNonWorkflow(
      reqId,
      user.organizationId,
      parsed.data,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/requisitions/[reqId]/items]");
  }
}
