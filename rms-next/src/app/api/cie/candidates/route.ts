import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { HttpError } from "@/lib/http/http-error";
import { paginatedJson } from "@/lib/pagination/server";
import { parseListQueryParams } from "@/lib/pagination/zod";
import {
  CIE_CANDIDATE_SORT_KEYS,
  listCieCandidatesPaged,
} from "@/lib/services/candidates-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cie/candidates — paginated org candidate roster for CIE workspace.
 *
 * Returns the canonical paginated envelope:
 *   { success: true, data: { items, pagination }, error: null }
 *
 * Query: page (>=1, default 1), limit (25|50|100, default 25),
 *        q (free-text), role (canonical role id), sort (whitelist with
 *        `created_desc` fallback). Invalid `limit`/`sort` soft-fall back
 *        to defaults so URL manipulation never 422s the workspace.
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
    const { page, limit, q, sort } = parseListQueryParams(url, {
      sort: { allowed: CIE_CANDIDATE_SORT_KEYS, fallback: "created_desc" },
    });
    const role = url.searchParams.get("role")?.trim() || null;

    const result = await listCieCandidatesPaged({
      organizationId: user.organizationId,
      page,
      limit,
      roleId: role,
      searchQuery: q,
      sort: sort ?? "created_desc",
    });

    return paginatedJson(result.items, {
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ detail: e.message }, { status: e.status });
    }
    return referenceWriteCatch(e, "[GET /api/cie/candidates]");
  }
}
