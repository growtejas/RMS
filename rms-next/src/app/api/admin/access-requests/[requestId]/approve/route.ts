import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { accessRequests } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import { adminUpdateUser } from "@/lib/services/user-admin-write-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    roles: z.array(z.string().min(1)).min(1),
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

    await adminUpdateUser(actor.userId, row.userId, {
      roles: parsed.data.roles,
      is_active: true,
    });

    await db
      .update(accessRequests)
      .set({
        status: "approved",
        reviewedBy: actor.userId,
        reviewedAt: new Date(),
      })
      .where(eq(accessRequests.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/admin/access-requests/[requestId]/approve]");
  }
}

