import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { selectBulkJobForOrg } from "@/lib/repositories/bulk-import-repo";
import { processBulkImportJob } from "@/lib/services/bulk-import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { jobId: string } };

/** GET /api/bulk-import/:jobId/status */
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

    const row = await selectBulkJobForOrg(params.jobId, user.organizationId);
    if (!row) {
      return NextResponse.json({ detail: "Bulk job not found" }, { status: 404 });
    }
    if (process.env.NODE_ENV !== "production" && row.status === "queued") {
      void processBulkImportJob(row.id, { onlyIfQueued: true }).catch((error) => {
        console.error("[bulk-status] auto-kick failed", { jobId: row.id, error });
      });
    }

    const summary = (row.resultSummary ?? {}) as {
      total_files?: number;
      processed_files?: number;
      success_count?: number;
      failure_count?: number;
      skipped_count?: number;
      failures?: Array<{ file_name?: string; reason?: string }>;
    };
    const total = Number(summary.total_files ?? 0);
    const processed = Number(summary.processed_files ?? 0);
    const progress = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

    return NextResponse.json({
      success: true,
      data: {
        operationId: row.id,
        kind: row.kind,
        status: row.status,
        total,
        processed,
        progress,
        success_count: Number(summary.success_count ?? 0),
        failure_count: Number(summary.failure_count ?? 0),
        skipped_count: Number(summary.skipped_count ?? 0),
        created_count: Number(summary.success_count ?? 0),
        failed_count:
          Number(summary.failure_count ?? 0) + Number(summary.skipped_count ?? 0),
        failures: summary.failures ?? [],
        error: row.errorMessage ?? null,
        created_at: row.createdAt?.toISOString?.() ?? null,
        updated_at: row.updatedAt?.toISOString?.() ?? null,
      },
      error: null,
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/bulk-import/[jobId]/status]");
  }
}

