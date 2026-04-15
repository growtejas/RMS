import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getUserAuditLog } from "@/lib/services/workflow-audit-read-service";
import { referenceWriteCatch } from "@/lib/api/reference-write-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { userId: string } };

function parseUserId(params: { userId: string }): number | NextResponse {
  const userId = Number.parseInt(params.userId, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ detail: "Invalid user id" }, { status: 422 });
  }
  return userId;
}

/** GET /api/workflow/audit/user/{user_id} */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "HR");
    if (denied) {
      return denied;
    }

    const userId = parseUserId(params);
    if (userId instanceof NextResponse) {
      return userId;
    }

    const url = new URL(req.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const rawSize = Number.parseInt(url.searchParams.get("page_size") ?? "50", 10) || 50;
    const pageSize = Math.min(200, Math.max(1, rawSize));
    const entityType = url.searchParams.get("entity_type");
    const sinceRaw = url.searchParams.get("since");
    let since: Date | null = null;
    if (sinceRaw) {
      const d = new Date(sinceRaw);
      if (!Number.isNaN(d.getTime())) {
        since = d;
      }
    }

    const result = await getUserAuditLog({
      userId,
      entityType,
      since,
      page,
      pageSize,
    });

    return NextResponse.json({
      total: result.total,
      page: result.page,
      page_size: result.page_size,
      entries: result.entries,
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/workflow/audit/user/userId]");
  }
}
