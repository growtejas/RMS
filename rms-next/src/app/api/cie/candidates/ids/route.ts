import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { HttpError } from "@/lib/http/http-error";
import { getCandidateIdsForCieExport } from "@/lib/services/candidates-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cie/candidates/ids — all matching candidate IDs for bulk actions (capped).
 *
 * Same filters as list: q, role. Returns 422 if match count exceeds export cap.
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
    const q = url.searchParams.get("q")?.trim() || null;
    const role = url.searchParams.get("role")?.trim() || null;

    const { ids, total } = await getCandidateIdsForCieExport({
      organizationId: user.organizationId,
      roleId: role,
      searchQuery: q,
    });

    return NextResponse.json({ success: true, data: ids, meta: { total } });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ detail: e.message }, { status: e.status });
    }
    return referenceWriteCatch(e, "[GET /api/cie/candidates/ids]");
  }
}
