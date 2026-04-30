import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { enqueueBulkImportJob } from "@/lib/queue/bulk-import-queue";
import { insertBulkImportJob } from "@/lib/repositories/bulk-import-repo";
import { resumeSaveStream } from "@/lib/storage/resume-local-storage";
import { webToNodeReadable } from "@/lib/node/streams";
import { selectRequisitionItemMetaByItemId } from "@/lib/repositories/candidates-repo";
import { processBulkImportJob } from "@/lib/services/bulk-import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 100;

/** POST /api/candidates/bulk-upload */
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

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ detail: "Expected multipart form data" }, { status: 400 });
    }

    const reqItemRaw = form.get("requisition_item_id");
    const requisitionItemId = Number.parseInt(String(reqItemRaw ?? ""), 10);
    if (!Number.isFinite(requisitionItemId)) {
      return NextResponse.json({ detail: "requisition_item_id is required" }, { status: 422 });
    }
    const meta = await selectRequisitionItemMetaByItemId(requisitionItemId);
    if (!meta || meta.organizationId !== user.organizationId) {
      return NextResponse.json({ detail: "Requisition item not found" }, { status: 404 });
    }

    const duplicatePolicyRaw = String(form.get("duplicate_policy") ?? "skip").toLowerCase();
    const duplicatePolicy =
      duplicatePolicyRaw === "update" || duplicatePolicyRaw === "application_only"
        ? duplicatePolicyRaw
        : "skip";

    const files = form.getAll("files");
    const uploadFiles = files.filter((f): f is File => f instanceof File && f.size > 0);
    if (uploadFiles.length === 0) {
      return NextResponse.json({ detail: "files[] is required" }, { status: 400 });
    }
    if (uploadFiles.length > MAX_FILES) {
      return NextResponse.json(
        { detail: `Too many files. Maximum allowed is ${MAX_FILES}` },
        { status: 400 },
      );
    }

    const fileDescriptors: Array<{
      file_key: string;
      file_name: string;
      file_size: number;
      mime_type: string;
    }> = [];
    const rejected: Array<{ file_name: string; reason: string }> = [];

    for (const file of uploadFiles) {
      const mime = (file.type || "").trim() || "application/octet-stream";
      if (!ALLOWED.has(mime)) {
        rejected.push({
          file_name: file.name || "unknown",
          reason: "Invalid file type. Allowed: PDF, DOC, DOCX",
        });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push({
          file_name: file.name || "unknown",
          reason: "File exceeds 10MB",
        });
        continue;
      }
      const ext = EXT[mime] ?? ".pdf";
      const filename = `${randomBytes(16).toString("hex")}${ext}`;
      const key = await resumeSaveStream(webToNodeReadable(file.stream()), filename);
      fileDescriptors.push({
        file_key: key,
        file_name: file.name || key,
        file_size: file.size,
        mime_type: mime,
      });
    }

    if (fileDescriptors.length === 0) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: "No valid files to process",
          rejected,
        },
        { status: 422 },
      );
    }

    const initialSummary = {
      total_files: fileDescriptors.length + rejected.length,
      accepted_files: fileDescriptors.length,
      rejected_files: rejected.length,
      processed_files: 0,
      success_count: 0,
      failure_count: rejected.length,
      skipped_count: 0,
      failures: rejected.map((r) => ({ file_name: r.file_name, reason: r.reason })),
    };

    const jobId = await insertBulkImportJob({
      organizationId: user.organizationId,
      kind: "resume_bulk_upload",
      payload: {
        requisition_item_id: requisitionItemId,
        requisition_id: meta.reqId,
        initiated_by: user.userId,
        duplicate_policy: duplicatePolicy,
        files: fileDescriptors,
      },
      createdBy: user.userId,
    });

    if (!jobId) {
      return NextResponse.json({ detail: "Failed to create bulk operation" }, { status: 500 });
    }

    // Seed result summary so status endpoint can show immediate totals.
    const { updateBulkImportJobSummary } = await import("@/lib/repositories/bulk-import-repo");
    await updateBulkImportJobSummary({
      id: jobId,
      resultSummary: initialSummary,
      status: "queued",
      errorMessage: null,
    });

    let enqueueFailed = false;
    try {
      await enqueueBulkImportJob(jobId);
    } catch {
      enqueueFailed = true;
    }

    // Fallback: process in-process when queue is unavailable or worker isn't running.
    // Safe with worker mode because processor claims queued jobs before running.
    if (process.env.NODE_ENV !== "production" || enqueueFailed) {
      setTimeout(() => {
        void processBulkImportJob(jobId, { onlyIfQueued: true }).catch((error) => {
          console.error("[bulk-upload] fallback processing failed", { jobId, error });
        });
      }, enqueueFailed ? 0 : 1500);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          operationId: jobId,
          accepted_files: fileDescriptors.length,
          rejected_files: rejected.length,
        },
        error: null,
      },
      { status: 202 },
    );
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/candidates/bulk-upload]");
  }
}

