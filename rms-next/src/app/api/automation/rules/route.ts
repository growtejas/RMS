import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import { getDb } from "@/lib/db";
import { atsAutomationRules } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  trigger: z.string().min(1).max(80),
  config: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "TA");
    if (denied) {
      return denied;
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(atsAutomationRules)
      .where(eq(atsAutomationRules.organizationId, user.organizationId))
      .orderBy(asc(atsAutomationRules.id));
    return NextResponse.json({ rules: rows });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/automation/rules]");
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin");
    if (denied) {
      return denied;
    }
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const db = getDb();
    const [row] = await db
      .insert(atsAutomationRules)
      .values({
        organizationId: user.organizationId,
        name: parsed.data.name,
        trigger: parsed.data.trigger,
        config: parsed.data.config ?? {},
        isActive: parsed.data.is_active ?? true,
      })
      .returning();
    return NextResponse.json({ rule: row }, { status: 201 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/automation/rules]");
  }
}
