import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { paginatedJson } from "@/lib/pagination/server";
import { parsePaginationParams } from "@/lib/pagination/zod";
import {
  countJobsForOrganization,
  listJobsForOrganization,
} from "@/lib/repositories/ats-jobs-read-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE_NUMS = new Set<number>(PAGE_SIZE_OPTIONS);

/**
 * GET /api/v1/jobs — list ATS jobs (`requisition_item` alias) for active org.
 *
 * Returns the canonical paginated envelope when `?page=` or `?limit=` (canonical
 * 25/50/100) is supplied; otherwise returns the legacy `{ jobs }` shape so
 * existing public-API consumers keep working until they migrate.
 */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }
    const url = new URL(req.url);
    const itemStatus = url.searchParams.get("item_status");

    const limitRaw = url.searchParams.get("limit");
    const limitNum = limitRaw != null ? Number.parseInt(limitRaw, 10) : NaN;
    const useCanonical =
      url.searchParams.has("page") ||
      (Number.isFinite(limitNum) && PAGE_SIZE_NUMS.has(limitNum));

    if (useCanonical) {
      const { page, limit } = parsePaginationParams(url);
      const total = await countJobsForOrganization({
        organizationId: user.organizationId,
        itemStatus,
      });
      const offset = Math.max(0, (page - 1) * limit);
      const items = await listJobsForOrganization({
        organizationId: user.organizationId,
        itemStatus,
        limit,
        offset,
      });
      return paginatedJson(items, { page, limit, total });
    }

    const data = await listJobsForOrganization({
      organizationId: user.organizationId,
      itemStatus,
    });
    return NextResponse.json(
      { jobs: data },
      {
        headers: {
          "X-RMS-Jobs-Legacy":
            "Pass `page` and `limit` (25/50/100) to receive the canonical paginated envelope.",
        },
      },
    );
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/v1/jobs]");
  }
}
