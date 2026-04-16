import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getApplicationsPipelineJson } from "@/lib/services/applications-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optInt(raw: string | null): number | null {
  if (raw == null || raw === "") {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function parseCompact(raw: string | null): boolean {
  if (!raw) {
    return false;
  }
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** GET /api/applications/pipeline — stage bucket summary for TA/HR pipeline board. */
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

    const url = new URL(req.url);
    const requisitionItemId = optInt(url.searchParams.get("requisition_item_id"));
    const requisitionId = optInt(url.searchParams.get("requisition_id"));
    const compact = parseCompact(url.searchParams.get("compact"));

    if (url.searchParams.has("requisition_item_id") && requisitionItemId == null) {
      return NextResponse.json(
        { detail: "requisition_item_id must be an integer" },
        { status: 422 },
      );
    }
    if (url.searchParams.has("requisition_id") && requisitionId == null) {
      return NextResponse.json({ detail: "requisition_id must be an integer" }, { status: 422 });
    }

    const data = await getApplicationsPipelineJson({
      requisitionItemId,
      requisitionId,
      compact,
    });
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/applications/pipeline]");
  }
}
