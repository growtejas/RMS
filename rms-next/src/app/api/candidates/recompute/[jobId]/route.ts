import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { selectBulkJobForOrg } from "@/lib/repositories/bulk-import-repo";
import { readCieBulkSnapshot } from "@/lib/services/cie/candidate-intelligence-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jobIdParam = z.object({ jobId: z.string().uuid() });

type Ctx = { params: { jobId: string } };

/** GET /api/candidates/recompute/[jobId] — poll bulk CIE job progress. */
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

    const idParsed = jobIdParam.safeParse({ jobId: params.jobId });
    if (!idParsed.success) {
      return NextResponse.json({ detail: "Invalid job id" }, { status: 422 });
    }

    const row = await selectBulkJobForOrg(idParsed.data.jobId, user.organizationId);
    if (!row) {
      return NextResponse.json({ detail: "Job not found" }, { status: 404 });
    }
    if (row.kind !== "cie_recompute") {
      return NextResponse.json({ detail: "Not a CIE recompute job" }, { status: 400 });
    }

    let redisSnap = null as Awaited<ReturnType<typeof readCieBulkSnapshot>>;
    try {
      redisSnap = await readCieBulkSnapshot(idParsed.data.jobId);
    } catch {
      redisSnap = null;
    }

    const summary = (row.resultSummary as Record<string, unknown> | null) ?? null;
    const expected =
      redisSnap?.expected ??
      (typeof summary?.expected === "number" ? summary.expected : null);
    const processed = redisSnap?.processed ?? null;
    const ok = redisSnap?.ok ?? (typeof summary?.ok === "number" ? summary.ok : null);
    const failed =
      redisSnap?.failed ?? (typeof summary?.failed === "number" ? summary.failed : null);
    const skipped =
      redisSnap?.skipped ??
      (typeof summary?.skipped === "number" ? summary.skipped : null);
    const progressPct =
      expected && expected > 0 && processed != null
        ? Math.min(100, Math.round((processed / expected) * 100))
        : row.status === "completed"
          ? 100
          : 0;

    return NextResponse.json({
      bulk_job_id: row.id,
      status: row.status,
      kind: row.kind,
      redis: redisSnap,
      result_summary: row.resultSummary,
      progress_pct: progressPct,
      counts: {
        expected,
        processed,
        ok,
        failed,
        skipped,
      },
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/candidates/recompute/[jobId]]");
  }
}
