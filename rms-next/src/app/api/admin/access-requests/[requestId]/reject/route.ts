import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { accessRequests } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    reason: z.string().max(2000).optional(),
  })
  .strict();

type Ctx = { params: { requestId: string } };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const actor = await requireBearerUser(req);
    if (actor instanceof NextResponse) return actor;
    const denied = requireAnyRole(actor, "Admin", "Owner");
    if (denied) return denied;

    const id = params.requestId;
    if (!id) {
      return NextResponse.json({ detail: "Invalid request id" }, { status: 422 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ detail: "Invalid body", issues: parsed.error.flatten() }, { status: 422 });
    }

    const db = getDb();
    const [row] = await db
      .select()
      .from(accessRequests)
      .where(eq(accessRequests.id, id))
      .limit(1);
    if (!row) {
      throw new HttpError(404, "Access request not found");
    }

    await db
      .update(accessRequests)
      .set({
        status: "rejected",
        reviewedBy: actor.userId,
        reviewedAt: new Date(),
        // store reason in message if provided and message empty? keep original message intact
        ...(parsed.data.reason
          ? {
              message:
                row.message && row.message.trim()
                  ? row.message
                  : `Reject reason: ${parsed.data.reason.trim()}`,
            }
          : {}),
      })
      .where(eq(accessRequests.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/admin/access-requests/[requestId]/reject]");
  }
}

