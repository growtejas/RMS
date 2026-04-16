import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { selectInboundEventsWithDedupeReview } from "@/lib/repositories/inbound-events-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ingest/dedupe-reviews — inbound events flagged by Phase 3 soft dedupe. */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "HR", "TA");
    if (denied) {
      return denied;
    }

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(100, Math.max(1, Number.parseInt(limitRaw ?? "50", 10) || 50));

    const rows = await selectInboundEventsWithDedupeReview(limit);
    return NextResponse.json({ items: rows });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/ingest/dedupe-reviews]");
  }
}
