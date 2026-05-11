import { NextResponse } from "next/server";
import { eq, desc, and, count } from "drizzle-orm";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { accessRequests, users } from "@/lib/db/schema";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { parsePaginationParams } from "@/lib/pagination/zod";
import { paginatedJson } from "@/lib/pagination/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCanonicalListRequest(url: URL): boolean {
  if (url.searchParams.has("page")) return true;
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit == null) return false;
  const parsed = Number.parseInt(rawLimit, 10);
  return (
    Number.isFinite(parsed) &&
    (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
  );
}

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
    if (isCanonicalListRequest(url)) {
      const { page, limit } = parsePaginationParams(url);
      const offset = (page - 1) * limit;
      const [items, totalRow] = await Promise.all([
        db
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
          .orderBy(desc(accessRequests.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ c: count() })
          .from(accessRequests)
          .where(and(eq(accessRequests.status, status))),
      ]);
      const total = Number(totalRow?.[0]?.c ?? 0);
      return paginatedJson(items, { page, limit, total });
    }
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

    const res = NextResponse.json({ status, requests: rows });
    res.headers.set("Deprecation", "list-access-requests-bare-shape");
    return res;
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/admin/access-requests]");
  }
}

