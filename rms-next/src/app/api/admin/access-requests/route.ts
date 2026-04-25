import { NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { accessRequests, users } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/access-requests?status=pending — list access requests for review. */
export async function GET(req: Request) {
  try {
    const actor = await requireBearerUser(req);
    if (actor instanceof NextResponse) return actor;
    const denied = requireAnyRole(actor, "Admin", "Owner");
    if (denied) return denied;

    const url = new URL(req.url);
    const statusRaw = url.searchParams.get("status")?.trim().toLowerCase() || "pending";
    const status =
      statusRaw === "approved" || statusRaw === "rejected" || statusRaw === "pending"
        ? (statusRaw as "pending" | "approved" | "rejected")
        : "pending";

    const db = getDb();
    const rows = await db
      .select({
        id: accessRequests.id,
        user_id: accessRequests.userId,
        message: accessRequests.message,
        status: accessRequests.status,
        reviewed_by: accessRequests.reviewedBy,
        reviewed_at: accessRequests.reviewedAt,
        created_at: accessRequests.createdAt,
        username: users.username,
        is_active: users.isActive,
      })
      .from(accessRequests)
      .innerJoin(users, eq(accessRequests.userId, users.userId))
      .where(and(eq(accessRequests.status, status)))
      .orderBy(desc(accessRequests.createdAt));

    return NextResponse.json({ status, requests: rows });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/admin/access-requests]");
  }
}

