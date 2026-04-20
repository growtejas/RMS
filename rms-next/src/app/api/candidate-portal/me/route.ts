import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { getDb } from "@/lib/db";
import { applications } from "@/lib/db/schema";
import { selectApplicationById } from "@/lib/repositories/applications-repo";
import { resolvePortalApplication } from "@/lib/services/candidate-portal-token-service";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/candidate-portal/me?token= — applicant self-service read (magic link). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("token")?.trim();
    if (!raw) {
      return NextResponse.json({ detail: "token required" }, { status: 401 });
    }
    const resolved = await resolvePortalApplication(raw);
    if (!resolved) {
      return NextResponse.json({ detail: "Invalid or expired token" }, { status: 401 });
    }
    const db = getDb();
    const [meta] = await db
      .select({ organizationId: applications.organizationId })
      .from(applications)
      .where(eq(applications.applicationId, resolved.applicationId))
      .limit(1);
    if (!meta) {
      return NextResponse.json({ detail: "Not found" }, { status: 404 });
    }
    const app = await selectApplicationById(resolved.applicationId, meta.organizationId);
    if (!app) {
      return NextResponse.json({ detail: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      application_id: app.application.applicationId,
      current_stage: app.application.currentStage,
      requisition_item_id: app.application.requisitionItemId,
      candidate: app.candidate,
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/candidate-portal/me]");
  }
}
