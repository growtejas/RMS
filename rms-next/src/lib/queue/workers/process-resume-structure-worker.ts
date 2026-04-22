/**
 * Worker: async LLM refinement for `candidates.resume_structured_profile`.
 *
 * Run: `tsx src/lib/queue/workers/process-resume-structure-worker.ts`
 * Requires REDIS_URL, DATABASE_URL, and RESUME_STRUCTURE_* LLM env when refining.
 */
import { Worker } from "bullmq";

import { getDb } from "@/lib/db";
import { candidates } from "@/lib/db/schema";
import { log } from "@/lib/logging/logger";
import {
  REFINE_RESUME_STRUCTURE_JOB,
  RESUME_STRUCTURE_QUEUE_NAME,
  type RefineResumeStructurePayload,
} from "@/lib/queue/resume-structure-queue";
import { getQueueConnectionOptions } from "@/lib/queue/redis";
import {
  parseResumeStructuredDocument,
  resumeStructuredDocumentV1Z,
  type ResumeStructuredDocumentV1,
} from "@/lib/services/resume-structure/resume-structure.schema";
import { tryRefineStructuredProfileWithLlm } from "@/lib/services/resume-structure/llm-refiner";
import { eq } from "drizzle-orm";

async function processJob(payload: RefineResumeStructurePayload): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({
      candidateId: candidates.candidateId,
      resumeParseCache: candidates.resumeParseCache,
      resumeStructuredProfile: candidates.resumeStructuredProfile,
      resumeStructureStatus: candidates.resumeStructureStatus,
    })
    .from(candidates)
    .where(eq(candidates.candidateId, payload.candidateId))
    .limit(1);

  if (!row) {
    log("warn", "resume_structure_refine_candidate_missing", {
      candidate_id: payload.candidateId,
    });
    return;
  }

  if (row.resumeStructureStatus !== "pending") {
    log("info", "resume_structure_refine_skip_status", {
      candidate_id: payload.candidateId,
      status: row.resumeStructureStatus,
    });
    return;
  }

  const cache = row.resumeParseCache as { rawText?: string } | null;
  const rawText = typeof cache?.rawText === "string" ? cache.rawText : null;
  if (!rawText?.trim()) {
    await db
      .update(candidates)
      .set({
        resumeStructureStatus: "failed",
        updatedAt: new Date(),
      })
      .where(eq(candidates.candidateId, payload.candidateId));
    log("warn", "resume_structure_refine_no_text", {
      candidate_id: payload.candidateId,
    });
    return;
  }

  const parsed = parseResumeStructuredDocument(row.resumeStructuredProfile);
  if (!parsed.ok || parsed.data.extractor !== "rules_v2") {
    await db
      .update(candidates)
      .set({ resumeStructureStatus: "ready", updatedAt: new Date() })
      .where(eq(candidates.candidateId, payload.candidateId));
    return;
  }

  const refined = await tryRefineStructuredProfileWithLlm({
    resumeText: rawText,
    draftProfile: parsed.data.profile,
    draftWarnings: parsed.data.warnings,
    logContext: { candidate_id: payload.candidateId, job: "refine-worker" },
  });

  if (!refined) {
    await db
      .update(candidates)
      .set({ resumeStructureStatus: "ready", updatedAt: new Date() })
      .where(eq(candidates.candidateId, payload.candidateId));
    log("info", "resume_structure_refine_llm_noop", {
      candidate_id: payload.candidateId,
    });
    return;
  }

  const mergedFieldConfidence =
    refined.fieldConfidenceOverride &&
    Object.keys(refined.fieldConfidenceOverride).length > 0
      ? {
          ...parsed.data.field_confidence,
          ...refined.fieldConfidenceOverride,
        }
      : parsed.data.field_confidence;

  const nextDoc: ResumeStructuredDocumentV1 = {
    ...parsed.data,
    extractor: "rules_v2+llm",
    profile: refined.profile,
    warnings: refined.warnings.slice(0, 30),
    confidence: {
      overall: Math.min(
        1,
        Math.max(parsed.data.confidence.overall, 0.55),
      ),
    },
    field_confidence: mergedFieldConfidence,
    extracted_at: new Date().toISOString(),
  };

  const validated = resumeStructuredDocumentV1Z.safeParse(nextDoc);
  if (!validated.success) {
    await db
      .update(candidates)
      .set({ resumeStructureStatus: "ready", updatedAt: new Date() })
      .where(eq(candidates.candidateId, payload.candidateId));
    log("warn", "resume_structure_refine_validate_failed", {
      candidate_id: payload.candidateId,
      issues: validated.error.issues.slice(0, 6),
    });
    return;
  }

  await db
    .update(candidates)
    .set({
      resumeStructuredProfile: validated.data as unknown as Record<string, unknown>,
      resumeStructureStatus: "ready",
      updatedAt: new Date(),
    })
    .where(eq(candidates.candidateId, payload.candidateId));

  log("info", "resume_structure_refine_complete", {
    candidate_id: payload.candidateId,
  });
}

async function main() {
  const worker = new Worker<RefineResumeStructurePayload>(
    RESUME_STRUCTURE_QUEUE_NAME,
    async (job) => {
      if (job.name !== REFINE_RESUME_STRUCTURE_JOB) {
        return;
      }
      await processJob(job.data);
    },
    { connection: getQueueConnectionOptions(), concurrency: 2 },
  );
  worker.on("failed", (job, err) => {
    log("error", "resume_structure_worker_job_failed", {
      job_id: job?.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
  log("info", "resume_structure_worker_started", {
    queue: RESUME_STRUCTURE_QUEUE_NAME,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
