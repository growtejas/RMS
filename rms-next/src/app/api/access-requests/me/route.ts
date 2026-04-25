import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireBearerUserAllowInactive } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { accessRequests } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/access-requests/me — latest access request for current user. */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUserAllowInactive(req);
    if (user instanceof NextResponse) return user;

    const db = getDb();
    const [row] = await db
      .select()
      .from(accessRequests)
      .where(eq(accessRequests.userId, user.userId))
      .orderBy(desc(accessRequests.createdAt))
      .limit(1);

    if (!row) {
      return NextResponse.json({ access_request: null });
    }
    return NextResponse.json({
      access_request: {
        id: row.id,
        status: row.status,
        message: row.message ?? null,
        created_at: row.createdAt?.toISOString?.() ?? null,
        reviewed_at: row.reviewedAt?.toISOString?.() ?? null,
        reviewed_by: row.reviewedBy ?? null,
      },
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/access-requests/me]");
  }
}

