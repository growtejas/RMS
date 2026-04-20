import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { listJobsForOrganization } from "@/lib/repositories/ats-jobs-read-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/jobs — list ATS jobs (`requisition_item` alias) for active org. */
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
    const status = url.searchParams.get("item_status");
    const data = await listJobsForOrganization({
      organizationId: user.organizationId,
      itemStatus: status,
    });
    return NextResponse.json({ jobs: data });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/v1/jobs]");
  }
}
