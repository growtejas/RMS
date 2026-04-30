import { and, eq } from "drizzle-orm";

import { normalizeRoleList } from "@/lib/auth/normalize-roles";
import { getDb } from "@/lib/db";
import { bulkImportJobs } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import { findUserWithRolesById } from "@/lib/repositories/auth-user";
import { updateBulkImportJobSummary } from "@/lib/repositories/bulk-import-repo";
import { createCandidateJson } from "@/lib/services/candidates-service";
import { recomputeRankingForRequisitionItem } from "@/lib/services/ranking-service";
import { parseResumeArtifact } from "@/lib/services/resume-parser-service";
import { contentHashFromArtifact } from "@/lib/services/resume-parse-cache";
import { runResumeStructurePipeline } from "@/lib/services/resume-structure/resume-structure-pipeline";
import { resumeLocalFilePath } from "@/lib/storage/resume-local-storage";

type ResumeBulkPayload = {
  requisition_item_id?: number;
  requisition_id?: number;
  duplicate_policy?: "skip" | "update" | "application_only";
  files?: Array<{
    file_key: string;
    file_name: string;
    file_size: number;
    mime_type: string;
  }>;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_SANITIZE_REGEX = /[^\d+]/g;

function extractFirstEmail(parsedData: Record<string, unknown>): string | null {
  const emails = parsedData.emails;
  if (!Array.isArray(emails)) return null;
  for (const v of emails) {
    if (typeof v === "string") {
      const normalized = v.trim().toLowerCase();
      if (EMAIL_REGEX.test(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}

function hasAnyEmailCandidate(parsedData: Record<string, unknown>): boolean {
  const emails = parsedData.emails;
  return Array.isArray(emails) && emails.some((v) => typeof v === "string" && v.trim() !== "");
}

function extractFullName(parsedData: Record<string, unknown>): string | null {
  const fullName = parsedData.full_name;
  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim().slice(0, 150);
  }
  return null;
}

function extractStructuredName(structuredProfile: unknown): string | null {
  if (!structuredProfile || typeof structuredProfile !== "object") {
    return null;
  }
  const profile = structuredProfile as {
    profile?: { name?: unknown };
  };
  const name = profile.profile?.name;
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 150) : null;
}

function extractStructuredEmail(structuredProfile: unknown): string | null {
  if (!structuredProfile || typeof structuredProfile !== "object") {
    return null;
  }
  const profile = structuredProfile as {
    profile?: { email?: unknown };
  };
  const email = profile.profile?.email;
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return EMAIL_REGEX.test(normalized) ? normalized : null;
}

function extractStructuredPhone(structuredProfile: unknown): string | null {
  if (!structuredProfile || typeof structuredProfile !== "object") {
    return null;
  }
  const profile = structuredProfile as {
    profile?: { phone?: unknown };
  };
  const phone = profile.profile?.phone;
  if (typeof phone !== "string") return null;
  const compact = phone.replace(PHONE_SANITIZE_REGEX, "");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return compact.startsWith("+") ? `+${digits}` : digits;
}

function extractFirstPhone(parsedData: Record<string, unknown>): string | null {
  const phones = parsedData.phones;
  if (!Array.isArray(phones)) {
    return null;
  }
  for (const raw of phones) {
    if (typeof raw !== "string") {
      continue;
    }
    const compact = raw.replace(PHONE_SANITIZE_REGEX, "");
    const digits = compact.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      return compact.startsWith("+") ? `+${digits}` : digits;
    }
  }
  return null;
}

function hasAnyPhoneCandidate(parsedData: Record<string, unknown>): boolean {
  const phones = parsedData.phones;
  return Array.isArray(phones) && phones.some((v) => typeof v === "string" && v.trim() !== "");
}

/**
 * Processes a single bulk-import job.
 * When `onlyIfQueued` is true, this call first claims the job (queued -> running)
 * so the same job is not processed twice by a worker + fallback runner.
 */
export async function processBulkImportJob(
  bulkJobId: string,
  opts?: { onlyIfQueued?: boolean },
): Promise<{ started: boolean }> {
  const db = getDb();

  if (opts?.onlyIfQueued) {
    const claimed = await db
      .update(bulkImportJobs)
      .set({ status: "running", updatedAt: new Date(), errorMessage: null })
      .where(and(eq(bulkImportJobs.id, bulkJobId), eq(bulkImportJobs.status, "queued")))
      .returning({ id: bulkImportJobs.id });
    if (claimed.length === 0) {
      return { started: false };
    }
  }

  const [jobRow] = await db
    .select()
    .from(bulkImportJobs)
    .where(eq(bulkImportJobs.id, bulkJobId))
    .limit(1);
  if (!jobRow) {
    throw new HttpError(404, `Bulk job ${bulkJobId} not found`);
  }
  if (!opts?.onlyIfQueued) {
    await updateBulkImportJobSummary({
      id: bulkJobId,
      status: "running",
      resultSummary: {
        ...((jobRow.resultSummary as Record<string, unknown> | null) ?? {}),
        started_at: new Date().toISOString(),
      },
      errorMessage: null,
    });
  }

  const payload = (jobRow.payload ?? {}) as ResumeBulkPayload;
  const files = Array.isArray(payload.files) ? payload.files : [];
  const duplicatePolicy = payload.duplicate_policy ?? "skip";
  const requisitionItemId = Number(payload.requisition_item_id ?? 0);
  const requisitionId = Number(payload.requisition_id ?? 0);

  if (!Number.isFinite(requisitionItemId) || !Number.isFinite(requisitionId)) {
    throw new HttpError(422, "Bulk payload missing requisition context");
  }
  if (files.length === 0) {
    await updateBulkImportJobSummary({
      id: bulkJobId,
      status: "completed",
      resultSummary: {
        total_files: 0,
        processed_files: 0,
        success_count: 0,
        failure_count: 0,
        skipped_count: 0,
        failures: [],
      },
    });
    return { started: true };
  }
  if (!jobRow.createdBy) {
    throw new HttpError(422, "Bulk job missing created_by");
  }

  const userWithRoles = await findUserWithRolesById(jobRow.createdBy);
  if (!userWithRoles) {
    throw new HttpError(404, `Initiator user ${jobRow.createdBy} not found`);
  }
  const apiUser = {
    userId: userWithRoles.user.userId,
    username: userWithRoles.user.username,
    roles: normalizeRoleList(userWithRoles.roles),
    organizationId: jobRow.organizationId,
  };

  let processed = 0;
  let successCount = Number(
    (jobRow.resultSummary as { success_count?: unknown } | null)?.success_count ?? 0,
  );
  let failureCount = Number(
    (jobRow.resultSummary as { failure_count?: unknown } | null)?.failure_count ?? 0,
  );
  let skippedCount = Number(
    (jobRow.resultSummary as { skipped_count?: unknown } | null)?.skipped_count ?? 0,
  );
  const failures: Array<{ file_name: string; reason: string }> = Array.isArray(
    (jobRow.resultSummary as { failures?: unknown } | null)?.failures,
  )
    ? (((jobRow.resultSummary as { failures?: unknown }).failures as unknown[]) || []).filter(
        (x): x is { file_name: string; reason: string } => {
          return Boolean(
            x &&
              typeof x === "object" &&
              typeof (x as { file_name?: unknown }).file_name === "string" &&
              typeof (x as { reason?: unknown }).reason === "string",
          );
        },
      )
    : [];

  for (const file of files) {
    const safeName = file.file_name || file.file_key;
    try {
      const resumePath = resumeLocalFilePath(file.file_key);
      const parsed = await parseResumeArtifact({
        normalizedCandidate: {
          fullName: null,
          email: null,
          phone: null,
          currentCompany: null,
          resumeUrl: resumePath,
          source: "bulk_upload",
          externalId: `${bulkJobId}:${file.file_key}`,
          jobSlug: String(requisitionItemId),
        },
      });
      const parsedData = (parsed.parsedData ?? {}) as Record<string, unknown>;
      const structure = await runResumeStructurePipeline({
        rawText: parsed.rawText,
        sourceHash: contentHashFromArtifact(parsed),
        fallbackName: null,
        fallbackEmail: null,
        existingProfile: null,
        logContext: {
          path: "bulk_import",
          bulk_job_id: bulkJobId,
          requisition_item_id: requisitionItemId,
          file_name: safeName,
        },
      });

      // Prefer the established structured parser output first, then fallback to legacy parsed fields.
      const fullName =
        extractStructuredName(structure.document) ?? extractFullName(parsedData);
      const email =
        extractStructuredEmail(structure.document) ?? extractFirstEmail(parsedData);
      const phone =
        extractStructuredPhone(structure.document) ?? extractFirstPhone(parsedData);
      if (!fullName) {
        failureCount += 1;
        failures.push({
          file_name: safeName,
          reason: "Missing required field: name",
        });
      } else if (!email) {
        failureCount += 1;
        failures.push({
          file_name: safeName,
          reason: hasAnyEmailCandidate(parsedData)
            ? "Invalid email format"
            : "Missing required field: email",
        });
      } else if (!phone) {
        failureCount += 1;
        failures.push({
          file_name: safeName,
          reason: hasAnyPhoneCandidate(parsedData)
            ? "Invalid phone format"
            : "Missing required field: phone",
        });
      } else {
        try {
          await createCandidateJson(
            {
              requisition_item_id: requisitionItemId,
              requisition_id: requisitionId,
              full_name: fullName,
              email,
              phone,
              resume_path: resumePath,
              candidate_skills: Array.isArray(parsedData.skills)
                ? (parsedData.skills as unknown[])
                    .filter((s): s is string => typeof s === "string")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 80)
                : null,
              total_experience_years:
                typeof parsedData.experience_years === "number"
                  ? parsedData.experience_years
                  : null,
              notice_period_days:
                typeof parsedData.notice_period_days === "number"
                  ? Math.trunc(parsedData.notice_period_days)
                  : null,
              education_raw:
                typeof parsedData.education_raw === "string"
                  ? parsedData.education_raw.slice(0, 120)
                  : null,
            },
            apiUser,
          );
          successCount += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown candidate create error";
          if (duplicatePolicy === "skip" && msg.includes("already exists")) {
            skippedCount += 1;
          } else {
            failureCount += 1;
          }
          failures.push({ file_name: safeName, reason: msg });
        }
      }
    } catch (e) {
      failureCount += 1;
      failures.push({
        file_name: safeName,
        reason: e instanceof Error ? e.message : "Failed to process file",
      });
    } finally {
      processed += 1;
      await updateBulkImportJobSummary({
        id: bulkJobId,
        resultSummary: {
          total_files: files.length,
          processed_files: processed,
          success_count: successCount,
          failure_count: failureCount,
          skipped_count: skippedCount,
          failures: failures.slice(-100),
          duplicate_policy: duplicatePolicy,
        },
      });
    }
  }

  try {
    if (successCount > 0) {
      await recomputeRankingForRequisitionItem(requisitionItemId);
    }
  } catch (e) {
    failures.push({
      file_name: "ranking",
      reason: e instanceof Error ? e.message : "Ranking recompute failed",
    });
  }

  await updateBulkImportJobSummary({
    id: bulkJobId,
    status: failureCount > 0 && successCount === 0 ? "failed" : "completed",
    errorMessage: null,
    resultSummary: {
      total_files: files.length,
      processed_files: processed,
      success_count: successCount,
      failure_count: failureCount,
      skipped_count: skippedCount,
      failures: failures.slice(-200),
      completed_at: new Date().toISOString(),
      duplicate_policy: duplicatePolicy,
    },
  });

  return { started: true };
}

