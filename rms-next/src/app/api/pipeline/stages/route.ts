import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import { getDb } from "@/lib/db";
import { pipelineStageDefinitions } from "@/lib/db/schema";
import { listPipelineStages } from "@/lib/repositories/ats-jobs-read-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  stage_key: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  sort_order: z.number().int().optional(),
  is_terminal: z.boolean().optional(),
});

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
    const rows = await listPipelineStages(user.organizationId);
    return NextResponse.json({ stages: rows });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/pipeline/stages]");
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
      .insert(pipelineStageDefinitions)
      .values({
        organizationId: user.organizationId,
        stageKey: parsed.data.stage_key,
        label: parsed.data.label,
        sortOrder: parsed.data.sort_order ?? 0,
        isTerminal: parsed.data.is_terminal ?? false,
      })
      .returning();
    return NextResponse.json({ stage: row }, { status: 201 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/pipeline/stages]");
  }
}
