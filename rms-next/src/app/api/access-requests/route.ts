import { NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireBearerUserAllowInactive } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { accessRequests } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/access-requests — create a pending request (one pending per user). */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUserAllowInactive(req);
    if (user instanceof NextResponse) return user;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      raw = {};
    }
    const message =
      raw && typeof raw === "object" && "message" in raw
        ? String((raw as { message?: unknown }).message ?? "").trim()
        : "";

    const db = getDb();
    // Fast-path: if already has a pending request, return it.
    const [existing] = await db
      .select()
      .from(accessRequests)
      .where(and(eq(accessRequests.userId, user.userId), eq(accessRequests.status, "pending")))
      .orderBy(desc(accessRequests.createdAt))
      .limit(1);
    if (existing) {
      return NextResponse.json({
        ok: true,
        access_request: {
          id: existing.id,
          status: existing.status,
          message: existing.message ?? null,
          created_at: existing.createdAt?.toISOString?.() ?? null,
          reviewed_at: existing.reviewedAt?.toISOString?.() ?? null,
          reviewed_by: existing.reviewedBy ?? null,
        },
        deduped: true,
      });
    }

    const [created] = await db
      .insert(accessRequests)
      .values({
        userId: user.userId,
        message: message || null,
        status: "pending",
        createdAt: new Date(),
      })
      .returning();

    return NextResponse.json({
      ok: true,
      access_request: {
        id: created!.id,
        status: created!.status,
        message: created!.message ?? null,
        created_at: created!.createdAt?.toISOString?.() ?? null,
      },
    });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/access-requests]");
  }
}

