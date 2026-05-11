import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import { enqueueBulkImportJob } from "@/lib/queue/bulk-import-queue";
import {
  countBulkJobsForOrg,
  insertBulkImportJob,
  listBulkJobsForOrgPaged,
  listRecentBulkJobs,
} from "@/lib/repositories/bulk-import-repo";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { parsePaginationParams } from "@/lib/pagination/zod";
import { paginatedJson } from "@/lib/pagination/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  kind: z.string().min(1).max(40),
  payload: z.record(z.string(), z.unknown()).optional(),
});

function isCanonicalListRequest(url: URL): boolean {
  if (url.searchParams.has("page")) return true;
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit == null) return false;
  const parsed = Number.parseInt(rawLimit, 10);
  return (
    Number.isFinite(parsed) &&
    (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
  );
}

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
    const url = new URL(req.url);
    if (isCanonicalListRequest(url)) {
      const { page, limit } = parsePaginationParams(url);
      const offset = (page - 1) * limit;
      const [items, total] = await Promise.all([
        listBulkJobsForOrgPaged(user.organizationId, { limit, offset }),
        countBulkJobsForOrg(user.organizationId),
      ]);
      return paginatedJson(items, { page, limit, total });
    }
    const rows = await listRecentBulkJobs(user.organizationId);
    const res = NextResponse.json({ jobs: rows });
    res.headers.set("Deprecation", "list-bulk-import-bare-shape");
    return res;
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
