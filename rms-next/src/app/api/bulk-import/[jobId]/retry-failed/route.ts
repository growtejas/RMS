import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { enqueueBulkImportJob } from "@/lib/queue/bulk-import-queue";
import {
  insertBulkImportJob,
  selectBulkJobForOrg,
  updateBulkImportJobSummary,
} from "@/lib/repositories/bulk-import-repo";
import { processBulkImportJob } from "@/lib/services/bulk-import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { jobId: string } };

type ResumeFileDescriptor = {
  file_key: string;
  file_name: string;
  file_size: number;
  mime_type: string;
};

/** POST /api/bulk-import/:jobId/retry-failed */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin");
    if (denied) {
      return denied;
    }

    const row = await selectBulkJobForOrg(params.jobId, user.organizationId);
    if (!row) {
      return NextResponse.json({ detail: "Bulk job not found" }, { status: 404 });
    }
    const payload = (row.payload ?? {}) as {
      requisition_item_id?: number;
      requisition_id?: number;
      duplicate_policy?: "skip" | "update" | "application_only";
      files?: ResumeFileDescriptor[];
    };
    const files = Array.isArray(payload.files) ? payload.files : [];
    const failures = Array.isArray(
      (row.resultSummary as { failures?: unknown } | null)?.failures,
    )
      ? (((row.resultSummary as { failures?: unknown }).failures as unknown[]) || []).filter(
          (f): f is { file_name: string; reason?: string } =>
            Boolean(
              f &&
                typeof f === "object" &&
                typeof (f as { file_name?: unknown }).file_name === "string",
            ),
        )
      : [];

    const failedNames = new Set(
      failures
        .map((f) => f.file_name)
        .filter((name) => name && name !== "ranking"),
    );
    const retryFiles = files.filter((f) => failedNames.has(f.file_name));
    if (retryFiles.length === 0) {
      return NextResponse.json(
        { detail: "No retryable failed files found for this operation" },
        { status: 400 },
      );
    }

    const newJobId = await insertBulkImportJob({
      organizationId: user.organizationId,
      kind: row.kind,
      payload: {
        requisition_item_id: payload.requisition_item_id ?? null,
        requisition_id: payload.requisition_id ?? null,
        initiated_by: user.userId,
        duplicate_policy: payload.duplicate_policy ?? "skip",
        retry_of_job_id: row.id,
        files: retryFiles,
      },
      createdBy: user.userId,
    });
    if (!newJobId) {
      return NextResponse.json({ detail: "Failed to create retry operation" }, { status: 500 });
    }

    await updateBulkImportJobSummary({
      id: newJobId,
      status: "queued",
      errorMessage: null,
      resultSummary: {
        total_files: retryFiles.length,
        accepted_files: retryFiles.length,
        rejected_files: 0,
        processed_files: 0,
        success_count: 0,
        failure_count: 0,
        skipped_count: 0,
        failures: [],
        retried_from_operation_id: row.id,
      },
    });

    let enqueueFailed = false;
    try {
      await enqueueBulkImportJob(newJobId);
    } catch {
      enqueueFailed = true;
    }
    if (process.env.NODE_ENV !== "production" || enqueueFailed) {
      setTimeout(() => {
        void processBulkImportJob(newJobId, { onlyIfQueued: true }).catch((error) => {
          console.error("[bulk-retry] fallback processing failed", { newJobId, error });
        });
      }, enqueueFailed ? 0 : 1200);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          operationId: newJobId,
          retried_files: retryFiles.length,
        },
        error: null,
      },
      { status: 202 },
    );
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/bulk-import/[jobId]/retry-failed]");
  }
}

