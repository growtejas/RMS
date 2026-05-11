import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { paginatedJson } from "@/lib/pagination/server";
import { parsePaginationParams } from "@/lib/pagination/zod";
import {
  listMyRequisitionsRead,
  listMyRequisitionsReadPaged,
} from "@/lib/services/requisitions-read-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE_NUMS = new Set<number>(PAGE_SIZE_OPTIONS);

/**
 * GET /api/requisitions/my
 *
 * Canonical paginated envelope when `?page=` or canonical `?limit=` is supplied.
 * Otherwise returns the legacy bare array for backwards compatibility.
 */
export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limitNum = limitRaw != null ? Number.parseInt(limitRaw, 10) : NaN;
    const useCanonical =
      url.searchParams.has("page") ||
      (Number.isFinite(limitNum) && PAGE_SIZE_NUMS.has(limitNum));

    if (useCanonical) {
      const { page, limit } = parsePaginationParams(url);
      const result = await listMyRequisitionsReadPaged({
        organizationId: user.organizationId,
        userId: user.userId,
        page,
        limit,
      });
      return paginatedJson(result.items, {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
      });
    }

    const data = await listMyRequisitionsRead(
      user.organizationId,
      user.userId,
    );
    return NextResponse.json(data, {
      headers: {
        "X-RMS-Requisitions-Legacy":
          "Pass `page` and `limit` (25/50/100) to receive the canonical paginated envelope.",
      },
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/requisitions/my]");
  }
}
