import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parsePaginationParams, qSchema } from "@/lib/pagination/zod";
import { paginatedJson } from "@/lib/pagination/server";
import {
  countReferrals,
  selectReferralsPaged,
} from "@/lib/repositories/referrals-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/referrals — paginated list of referral candidates.
 *
 * Always returns the canonical paginated envelope. There is no legacy bare
 * shape here because this endpoint is new in the standardized rollout.
 */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) return user;
    const denied = requireAnyRole(user, "Employee", "HR", "Admin", "Manager", "TA");
    if (denied) return denied;

    const url = new URL(req.url);
    const { page, limit } = parsePaginationParams(url);
    const q = qSchema.parse(url.searchParams.get("q"));
    const offset = (page - 1) * limit;

    const filters = {
      organizationId: user.organizationId,
      searchQuery: q,
    };
    const [items, total] = await Promise.all([
      selectReferralsPaged({ filters, limit, offset }),
      countReferrals(filters),
    ]);

    return paginatedJson(items, { page, limit, total });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/referrals]");
  }
}
