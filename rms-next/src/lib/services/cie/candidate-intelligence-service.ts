import { log } from "@/lib/logging/logger";
import { getSharedRedisConnection } from "@/lib/queue/redis";
import * as cieRepo from "@/lib/repositories/cie-repo";
import { updateBulkImportJobSummary } from "@/lib/repositories/bulk-import-repo";
import {
  batchUpdateResumeParseCache,
  selectCandidateById,
} from "@/lib/repositories/candidates-repo";
import type { CandidateReport, ParsedCandidate } from "@/lib/services/cie/cie.schema";
import { resolveLegacyResumeArtifactForCandidate } from "@/lib/services/cie/cie-legacy-resume-parse";
import {
  resolveCieModelVersion,
  resolveCieParsedSnapshotDedupeKey,
  resolveCieParserSource,
  runCieReportLlm,
  runCieAskLlm,
} from "@/lib/services/cie/cie-llm";
import {
  legacyParsedDataHints,
  tryBuildParsedCandidateFromLegacyParsedData,
  type LegacyParsedDataHints,
} from "@/lib/services/cie/parsed-candidate-from-legacy-parsed-data";
import { alignParsedCandidateWithAtsSignals } from "@/lib/services/cie/cie-ats-align";
import { tryBuildParsedCandidateFromStructuredUnknown } from "@/lib/services/cie/parsed-candidate-from-resume-structure";
import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";
import {
  contentHashFromArtifact,
  resumeParseCacheRawText,
} from "@/lib/services/resume-parse-cache";
import {
  resolveCieStrictLlmParse,
  runStrictResumeParseFromText,
} from "@/lib/services/resume-structure/strict-llm-resume-parse";
import { strictLlmParseToParsedCandidate } from "@/lib/services/resume-structure/strict-llm-resume-parse-mapper";
import {
  resolveResumeStructureV2Enabled,
  runStrictResumeV2FromText,
} from "@/lib/services/resume-structure/strict-resume-v2-llm";
import { v2ToParsedCandidate } from "@/lib/services/resume-structure/strict-resume-v2-mapper";
import { HttpError } from "@/lib/http/http-error";

export const CIE_REPORT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const LOCK_PREFIX = "cie:lock:candidate:";
const BULK_PREFIX = "cie:bulk:";

function lockKey(candidateId: number): string {
  return `${LOCK_PREFIX}${candidateId}`;
}

export async function acquireCieCandidateLock(
  candidateId: number,
  ttlSec: number,
): Promise<boolean> {
  const r = getSharedRedisConnection();
  const ok = await r.set(lockKey(candidateId), "1", "EX", ttlSec, "NX");
  return ok === "OK";
}

export async function releaseCieCandidateLock(candidateId: number): Promise<void> {
  const r = getSharedRedisConnection();
  await r.del(lockKey(candidateId));
}

export async function initCieBulkRedisTracking(
  jobId: string,
  expectedTotal: number,
): Promise<void> {
  const r = getSharedRedisConnection();
  const key = `${BULK_PREFIX}${jobId}`;
  await r.hset(key, {
    expected: String(expectedTotal),
    processed: "0",
    ok: "0",
    failed: "0",
    skipped: "0",
  });
  await r.expire(key, 86_400);
}

export async function incrementCieBulkCounter(
  jobId: string,
  field: "ok" | "failed" | "skipped",
): Promise<{
  processed: number;
  expected: number;
  ok: number;
  failed: number;
  skipped: number;
  isComplete: boolean;
}> {
  const r = getSharedRedisConnection();
  const key = `${BULK_PREFIX}${jobId}`;
  await r.hincrby(key, "processed", 1);
  await r.hincrby(key, field, 1);
  const h = await r.hgetall(key);
  const expected = Number.parseInt(h.expected ?? "0", 10) || 0;
  const processed = Number.parseInt(h.processed ?? "0", 10) || 0;
  const ok = Number.parseInt(h.ok ?? "0", 10) || 0;
  const failed = Number.parseInt(h.failed ?? "0", 10) || 0;
  const skipped = Number.parseInt(h.skipped ?? "0", 10) || 0;
  const isComplete = expected > 0 && processed >= expected;
  return { processed, expected, ok, failed, skipped, isComplete };
}

export async function readCieBulkSnapshot(jobId: string): Promise<{
  expected: number;
  processed: number;
  ok: number;
  failed: number;
  skipped: number;
} | null> {
  const r = getSharedRedisConnection();
  const h = await r.hgetall(`${BULK_PREFIX}${jobId}`);
  if (!h || Object.keys(h).length === 0) return null;
  return {
    expected: Number.parseInt(h.expected ?? "0", 10) || 0,
    processed: Number.parseInt(h.processed ?? "0", 10) || 0,
    ok: Number.parseInt(h.ok ?? "0", 10) || 0,
    failed: Number.parseInt(h.failed ?? "0", 10) || 0,
    skipped: Number.parseInt(h.skipped ?? "0", 10) || 0,
  };
}

export async function ensureLatestParsedSnapshot(params: {
  organizationId: string;
  candidateId: number;
}): Promise<
  | { ok: true; parsed: ParsedCandidate; legacyParserHints?: LegacyParsedDataHints | null }
  | { ok: false; reason: string }
> {
  const row = await selectCandidateById(params.candidateId, params.organizationId);
  if (!row) {
    return { ok: false, reason: "candidate_not_found" };
  }

  let effectiveContentHash = row.resumeContentHash ?? null;
  const dedupeKey = resolveCieParsedSnapshotDedupeKey(effectiveContentHash);
  const latest = await cieRepo.selectLatestParsedRow(params.candidateId, params.organizationId);
  if (latest && latest.sourceResumeContentHash === dedupeKey) {
    const aligned = alignParsedCandidateWithAtsSignals({
      parsed: latest.parsed,
      legacyHints: null,
      row,
    });
    return {
      ok: true,
      parsed: aligned.parsed,
      legacyParserHints: aligned.legacyHints,
    };
  }

  const persistParsed = async (
    parsed: ParsedCandidate,
    contentHashForDedupe: string | null,
    hints: LegacyParsedDataHints | null,
    explicitParsedArtifact?: ParsedResumeArtifact | null,
  ): Promise<{ ok: true; parsed: ParsedCandidate; legacyParserHints: LegacyParsedDataHints | null }> => {
    let parsedOut = parsed;
    if (resolveResumeStructureV2Enabled()) {
      const raw = resumeParseCacheRawText(row.resumeParseCache);
      if (raw) {
        const v2 = await runStrictResumeV2FromText({
          resumeText: raw,
          logContext: { candidate_id: params.candidateId, path: "cie_v2" },
        });
        if (v2.ok) {
          const mapped = v2ToParsedCandidate(v2.data);
          if (mapped.ok) {
            parsedOut = mapped.data;
          }
        }
      }
    }
    if (resolveCieStrictLlmParse()) {
      const raw = resumeParseCacheRawText(row.resumeParseCache);
      if (raw) {
        const strictResult = await runStrictResumeParseFromText({
          resumeText: raw,
          bypassStructureLlmEnabledGate: true,
          logContext: { candidate_id: params.candidateId, path: "cie_strict_llm" },
        });
        if (strictResult.ok) {
          const mapped = strictLlmParseToParsedCandidate(strictResult.data);
          if (mapped.ok) {
            parsedOut = mapped.data;
          }
        }
      }
    }
    const aligned = alignParsedCandidateWithAtsSignals({
      parsed: parsedOut,
      legacyHints: hints,
      row,
      explicitParsedArtifact,
    });
    await cieRepo.insertParsedDataRow({
      organizationId: params.organizationId,
      candidateId: params.candidateId,
      parsed: aligned.parsed,
      sourceResumeContentHash: resolveCieParsedSnapshotDedupeKey(contentHashForDedupe),
    });
    return {
      ok: true,
      parsed: aligned.parsed,
      legacyParserHints: aligned.legacyHints,
    };
  };

  if (!row.resumePath?.trim()) {
    const structuredOnly = tryBuildParsedCandidateFromStructuredUnknown(
      row.resumeStructuredProfile,
    );
    if (!structuredOnly.ok) {
      return { ok: false, reason: "no_resume" };
    }
    return persistParsed(structuredOnly.data, effectiveContentHash, null);
  }

  const src = resolveCieParserSource();

  if (src === "structured") {
    const built = tryBuildParsedCandidateFromStructuredUnknown(row.resumeStructuredProfile);
    if (!built.ok) {
      return { ok: false, reason: `parse_not_ready:${built.reason}` };
    }
    return persistParsed(built.data, effectiveContentHash, null);
  }

  let resolved: Awaited<ReturnType<typeof resolveLegacyResumeArtifactForCandidate>> | null = null;
  resolved = await resolveLegacyResumeArtifactForCandidate(row);

  if (resolved?.artifact.status === "processed") {
    const pd =
      resolved.artifact.parsedData &&
      typeof resolved.artifact.parsedData === "object" &&
      resolved.artifact.parsedData !== null
        ? (resolved.artifact.parsedData as Record<string, unknown>)
        : {};

    if (!resolved.fromCache) {
      const h = contentHashFromArtifact(resolved.artifact);
      await batchUpdateResumeParseCache([
        {
          candidateId: params.candidateId,
          resumeParseCache: { ...resolved.cacheRec } as Record<string, unknown>,
          resumeContentHash: h ?? undefined,
        },
      ]);
      effectiveContentHash = h ?? effectiveContentHash;
    }

    const legacyBuilt = tryBuildParsedCandidateFromLegacyParsedData(pd);
    if (legacyBuilt.ok) {
      return persistParsed(
        legacyBuilt.data,
        effectiveContentHash,
        legacyParsedDataHints(pd),
        resolved.artifact,
      );
    }
  }

  const structured = tryBuildParsedCandidateFromStructuredUnknown(row.resumeStructuredProfile);
  if (!structured.ok) {
    const legacyStatus = resolved?.artifact.status ?? "unavailable";
    return {
      ok: false,
      reason:
        legacyStatus !== "processed"
          ? `legacy_parse_failed:${legacyStatus};parse_not_ready:${structured.reason}`
          : `parse_not_ready:${structured.reason}`,
    };
  }
  return persistParsed(
    structured.data,
    effectiveContentHash,
    null,
    resolved?.artifact.status === "processed" ? resolved.artifact : undefined,
  );
}

export type CieProcessOutcome =
  | "ok"
  | "skipped_fresh"
  | "skipped_no_resume"
  | "failed_parse"
  | "failed_llm"
  | "failed_lock";

export async function processCieCandidateJob(input: {
  organizationId: string;
  candidateId: number;
  force: boolean;
  triggeredByUserId: number | null;
  bulkJobId: string | null;
}): Promise<{ outcome: CieProcessOutcome; detail?: string }> {
  const { organizationId, candidateId, force, triggeredByUserId, bulkJobId } = input;

  const locked = await acquireCieCandidateLock(candidateId, 300);
  if (!locked) {
    log("info", "cie_skip_lock_busy", { candidate_id: candidateId });
    if (bulkJobId) {
      await incrementCieBulkCounter(bulkJobId, "skipped");
      await maybeFinalizeCieBulkJob(bulkJobId);
    }
    return { outcome: "failed_lock", detail: "Another CIE job holds the candidate lock." };
  }

  try {
    const row = await selectCandidateById(candidateId, organizationId);
    if (!row) {
      if (bulkJobId) {
        await incrementCieBulkCounter(bulkJobId, "failed");
        await maybeFinalizeCieBulkJob(bulkJobId);
      }
      return { outcome: "failed_parse", detail: "candidate_not_found" };
    }
    if (!row.resumePath?.trim()) {
      const canStructured = tryBuildParsedCandidateFromStructuredUnknown(
        row.resumeStructuredProfile,
      ).ok;
      if (!canStructured) {
        if (bulkJobId) {
          await incrementCieBulkCounter(bulkJobId, "skipped");
          await maybeFinalizeCieBulkJob(bulkJobId);
        }
        return { outcome: "skipped_no_resume" };
      }
    }

    if (!force) {
      const latestReport = await cieRepo.selectLatestReportRow(
        candidateId,
        organizationId,
      );
      if (
        latestReport?.aiEvaluatedAt &&
        !latestReport.errorMessage &&
        Date.now() - latestReport.aiEvaluatedAt.getTime() < CIE_REPORT_MAX_AGE_MS
      ) {
        if (bulkJobId) {
          await incrementCieBulkCounter(bulkJobId, "skipped");
          await maybeFinalizeCieBulkJob(bulkJobId);
        }
        return { outcome: "skipped_fresh" };
      }
    }

    const parsedResult = await ensureLatestParsedSnapshot({ organizationId, candidateId });
    if (!parsedResult.ok) {
      log("warn", "cie_parse_failed", {
        candidate_id: candidateId,
        reason: parsedResult.reason,
      });
      if (bulkJobId) {
        await incrementCieBulkCounter(bulkJobId, "failed");
        await maybeFinalizeCieBulkJob(bulkJobId);
      }
      return { outcome: "failed_parse", detail: parsedResult.reason };
    }

    const t0 = Date.now();
    const llm = await runCieReportLlm({
      parsed: parsedResult.parsed,
      targetRole: null,
      legacyParserHints: parsedResult.legacyParserHints ?? null,
      logContext: { candidate_id: candidateId, organization_id: organizationId },
    });
    const processingTimeMs = Date.now() - t0;

    if (!llm.ok) {
      log("warn", "cie_llm_failed", {
        candidate_id: candidateId,
        reason: llm.reason,
        detail: llm.detail,
      });
      if (bulkJobId) {
        await incrementCieBulkCounter(bulkJobId, "failed");
        await maybeFinalizeCieBulkJob(bulkJobId);
      }
      return { outcome: "failed_llm", detail: llm.reason };
    }

    const report: CandidateReport = llm.data;
    await cieRepo.insertReportRow({
      organizationId,
      candidateId,
      report,
      confidenceScore: report.confidenceScore,
      modelVersion: resolveCieModelVersion(),
      processingTimeMs,
      triggeredBy: triggeredByUserId,
      errorMessage: null,
    });

    if (bulkJobId) {
      await incrementCieBulkCounter(bulkJobId, "ok");
      await maybeFinalizeCieBulkJob(bulkJobId);
    }

    log("info", "cie_report_stored", { candidate_id: candidateId });
    return { outcome: "ok" };
  } finally {
    await releaseCieCandidateLock(candidateId);
  }
}

async function maybeFinalizeCieBulkJob(bulkJobId: string): Promise<void> {
  const snap = await readCieBulkSnapshot(bulkJobId);
  if (!snap || snap.expected <= 0) return;
  if (snap.processed < snap.expected) return;

  const pct =
    snap.expected > 0 ? Math.round((snap.processed / snap.expected) * 100) : 100;
  await updateBulkImportJobSummary({
    id: bulkJobId,
    status: "completed",
    resultSummary: {
      kind: "cie_recompute",
      expected: snap.expected,
      processed: snap.processed,
      ok: snap.ok,
      failed: snap.failed,
      skipped: snap.skipped,
      progress_pct: pct,
    },
  });
}

export async function runCieAskForCandidate(input: {
  organizationId: string;
  candidateId: number;
  question: string;
  targetRole?: string | null;
}): Promise<{ answer: string; confidence: number }> {
  const parsedResult = await ensureLatestParsedSnapshot({
    organizationId: input.organizationId,
    candidateId: input.candidateId,
  });
  if (!parsedResult.ok) {
    throw new HttpError(400, parsedResult.reason);
  }
  const rep = await cieRepo.selectLatestReportRow(
    input.candidateId,
    input.organizationId,
  );
  const llm = await runCieAskLlm({
    parsed: parsedResult.parsed,
    report: rep?.report ?? null,
    question: input.question,
    targetRole: input.targetRole ?? null,
    logContext: { candidate_id: input.candidateId },
  });
  if (!llm.ok) {
    throw new HttpError(502, llm.detail ?? llm.reason);
  }
  await cieRepo.insertConversationRow({
    organizationId: input.organizationId,
    candidateId: input.candidateId,
    question: input.question.trim().slice(0, 2000),
    answer: llm.data.answer,
    confidence: llm.data.confidence,
    modelVersion: resolveCieModelVersion(),
  });
  return llm.data;
}
