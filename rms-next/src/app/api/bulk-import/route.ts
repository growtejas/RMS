import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import { enqueueBulkImportJob } from "@/lib/queue/bulk-import-queue";
import {
  insertBulkImportJob,
  listRecentBulkJobs,
} from "@/lib/repositories/bulk-import-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  kind: z.string().min(1).max(40),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin");
    if (denied) {
      return denied;
    }
    const rows = await listRecentBulkJobs(user.organizationId);
    return NextResponse.json({ jobs: rows });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/bulk-import]");
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin");
    if (denied) {
      return denied;
    }
    const parsed = await parseJsonBody(req, postSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const id = await insertBulkImportJob({
      organizationId: user.organizationId,
      kind: parsed.data.kind,
      payload: parsed.data.payload ?? null,
      createdBy: user.userId,
    });
    if (!id) {
      return NextResponse.json({ detail: "Failed to create job" }, { status: 500 });
    }
    try {
      await enqueueBulkImportJob(id);
    } catch {
      // Redis optional in dev; job row still tracks manual processing.
    }
    return NextResponse.json({ bulk_job_id: id, status: "queued" }, { status: 202 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/bulk-import]");
  }
}
