import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getJobForOrganization } from "@/lib/repositories/ats-jobs-read-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { jobId: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }
    const jobId = Number.parseInt(params.jobId, 10);
    if (!Number.isFinite(jobId)) {
      return NextResponse.json({ detail: "Invalid job id" }, { status: 422 });
    }
    const row = await getJobForOrganization(jobId, user.organizationId);
    if (!row) {
      return NextResponse.json({ detail: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/v1/jobs/[jobId]]");
  }
}
