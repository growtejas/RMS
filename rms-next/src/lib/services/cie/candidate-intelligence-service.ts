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
  resolveCieAllowStrictV1,
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
import {
  parsedCandidateLikelyCorrupted,
  v2DocumentLikelyCorrupted,
} from "@/lib/services/cie/cie-parsed-candidate-quality";
import { tryBuildParsedCandidateFromStructuredUnknown } from "@/lib/services/cie/parsed-candidate-from-resume-structure";
import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";
import {
  contentHashFromArtifact,
  resumeParseCacheRawText,
} from "@/lib/services/resume-parse-cache";
import {
  resolveCieStrictLlmParse,
  resolveCieStrictLlmParseOverrideV2,
  runStrictResumeParseFromText,
} from "@/lib/services/resume-structure/strict-llm-resume-parse";
import { strictLlmParseToParsedCandidate } from "@/lib/services/resume-structure/strict-llm-resume-parse-mapper";
import {
  resolveCieResumeV2Parse,
  resolveResumeStructureV2Enabled,
  runStrictResumeV2FromText,
} from "@/lib/services/resume-structure/strict-resume-v2-llm";
import { v2ToParsedCandidate } from "@/lib/services/resume-structure/strict-resume-v2-mapper";
import type { StrictResumeV2 } from "@/lib/services/resume-structure/strict-resume-v2.schema";
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
  | {
      ok: true;
      parsed: ParsedCandidate;
      parsedV2?: StrictResumeV2 | null;
      legacyParserHints?: LegacyParsedDataHints | null;
    }
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
    // Canonical: when v2 is present, always derive flat ParsedCandidate from v2
    // and ignore the stored parsed_json (which is a write-through cache only).
    let canonicalFlat: ParsedCandidate = latest.parsed;
    if (latest.parsedV2) {
      const projected = v2ToParsedCandidate(latest.parsedV2);
      if (projected.ok) {
        canonicalFlat = projected.data;
      } else {
        log("warn", "cie_snapshot_v2_projection_failed_on_cache_hit", {
          candidate_id: params.candidateId,
          reason: projected.reason,
        });
      }
    }
    const aligned = alignParsedCandidateWithAtsSignals({
      parsed: canonicalFlat,
      legacyHints: null,
      row,
    });
    return {
      ok: true,
      parsed: aligned.parsed,
      parsedV2: latest.parsedV2 ?? null,
      legacyParserHints: aligned.legacyHints,
    };
  }

  const persistParsed = async (
    parsed: ParsedCandidate,
    contentHashForDedupe: string | null,
    hints: LegacyParsedDataHints | null,
    explicitParsedArtifact?: ParsedResumeArtifact | null,
  ): Promise<
    | {
        ok: true;
        parsed: ParsedCandidate;
        parsedV2: StrictResumeV2 | null;
        legacyParserHints: LegacyParsedDataHints | null;
      }
    | { ok: false; reason: string }
  > => {
    const rawText = resumeParseCacheRawText(row.resumeParseCache);
    const attemptResumeV2 =
      resolveResumeStructureV2Enabled() || resolveCieResumeV2Parse();
    const allowStrictV1 = resolveCieAllowStrictV1();

    let parsedOut = parsed;
    let richV2: StrictResumeV2 | null = null;
    let v2ProjectionApplied = false;
    let v2FailureReason: string | null = null;
    let v2Truncated = false;
    let v2RawChars = 0;
    let v2UsedChars = 0;
    let v2ProvMin: number | null = null;
    let v2ProvMedian: number | null = null;

    if (attemptResumeV2 && rawText) {
      const v2 = await runStrictResumeV2FromText({
        resumeText: rawText,
        logContext: { candidate_id: params.candidateId, path: "cie_v2" },
        bypassResumeStructureV2EnabledGate:
          resolveCieResumeV2Parse() && !resolveResumeStructureV2Enabled(),
      });
      if (v2.ok) {
        richV2 = v2.data;
        v2Truncated = v2.truncated ?? false;
        v2RawChars = v2.rawChars ?? 0;
        v2UsedChars = v2.usedChars ?? 0;
        v2ProvMin = v2.provMin ?? null;
        v2ProvMedian = v2.provMedian ?? null;
        if (v2Truncated) {
          log("warn", "cie_truncation_detected", {
            candidate_id: params.candidateId,
            raw_chars: v2RawChars,
            used_chars: v2UsedChars,
            path: "cie_v2",
          });
        }
        const mapped = v2ToParsedCandidate(v2.data);
        if (mapped.ok) {
          parsedOut = mapped.data;
          v2ProjectionApplied = true;
        } else {
          v2FailureReason = `v2_projection:${mapped.reason}`;
        }
      } else {
        v2FailureReason = `v2:${v2.reason}`;
      }
    } else if (!attemptResumeV2) {
      v2FailureReason = "v2_disabled";
    } else if (!rawText) {
      v2FailureReason = "no_raw_text";
    }

    // Strict v1 LLM is gated behind CIE_ALLOW_STRICT_V1 (default off).
    // It is NOT a v2 substitute for the canonical column; only a flat-shape backup.
    const strictMayRun =
      allowStrictV1 &&
      resolveCieStrictLlmParse() &&
      Boolean(rawText) &&
      (!v2ProjectionApplied || resolveCieStrictLlmParseOverrideV2());
    if (strictMayRun && rawText) {
      const strictResult = await runStrictResumeParseFromText({
        resumeText: rawText,
        bypassStructureLlmEnabledGate: true,
        logContext: { candidate_id: params.candidateId, path: "cie_strict_llm" },
      });
      if (strictResult.ok) {
        const mapped = strictLlmParseToParsedCandidate(strictResult.data);
        if (mapped.ok) {
          parsedOut = mapped.data;
        }
      }
    } else if (
      resolveCieStrictLlmParse() &&
      v2ProjectionApplied &&
      !resolveCieStrictLlmParseOverrideV2()
    ) {
      log("info", "cie_strict_llm_skipped_prefers_v2_projection", {
        candidate_id: params.candidateId,
      });
    }

    // Optional rescue: if either the v2 document OR the projected ParsedCandidate looks
    // corrupted, retry v2 once. A single rescue attempt is enough; further failures
    // mean we will reject the snapshot below.
    if (v2ProjectionApplied && richV2 && attemptResumeV2 && rawText) {
      const docCheck = v2DocumentLikelyCorrupted(richV2, {
        min: v2ProvMin,
        median: v2ProvMedian,
      });
      const flatCorrupt = parsedCandidateLikelyCorrupted(parsedOut);
      if (!docCheck.ok || flatCorrupt) {
        log("info", "cie_corruption_detected", {
          candidate_id: params.candidateId,
          rescue_attempted: true,
          v2_doc_reasons: docCheck.ok ? [] : docCheck.reasons,
          flat_corrupt: flatCorrupt,
        });
        const v2rescue = await runStrictResumeV2FromText({
          resumeText: rawText,
          logContext: { candidate_id: params.candidateId, path: "cie_v2_rescue" },
          bypassResumeStructureV2EnabledGate:
            resolveCieResumeV2Parse() && !resolveResumeStructureV2Enabled(),
        });
        if (v2rescue.ok) {
          const mapped = v2ToParsedCandidate(v2rescue.data);
          const rescueDocCheck = v2DocumentLikelyCorrupted(v2rescue.data, {
            min: v2rescue.provMin,
            median: v2rescue.provMedian,
          });
          if (
            mapped.ok &&
            rescueDocCheck.ok &&
            !parsedCandidateLikelyCorrupted(mapped.data)
          ) {
            log("info", "cie_parsed_snapshot_v2_rescue", {
              candidate_id: params.candidateId,
            });
            richV2 = v2rescue.data;
            parsedOut = mapped.data;
            v2Truncated = v2rescue.truncated ?? false;
            v2RawChars = v2rescue.rawChars ?? v2RawChars;
            v2UsedChars = v2rescue.usedChars ?? v2UsedChars;
            v2ProvMin = v2rescue.provMin ?? null;
            v2ProvMedian = v2rescue.provMedian ?? null;
          }
        }
      }
    }

    // Canonical policy: only persist when v2 succeeded; otherwise reuse the prior good snapshot if any.
    // The fallback accepts ANY prior snapshot — v2-backed (preferred) OR a legacy parsed_json-only row
    // from the pre-canonical era — so reads (CIE Ask, report viewing) keep working until the next
    // successful v2 parse can refresh the snapshot.
    if (!richV2) {
      log("warn", "cie_v2_required_missing", {
        candidate_id: params.candidateId,
        reason: v2FailureReason ?? "unknown",
        parser_source_attempted: resolveCieParserSource(),
        had_prior_snapshot: Boolean(latest),
        had_prior_v2: Boolean(latest?.parsedV2),
      });
      if (latest) {
        log("info", "cie_snapshot_keep_prior_no_v2", {
          candidate_id: params.candidateId,
          source: latest.parsedV2 ? "prior_v2" : "prior_legacy_flat",
        });
        let flat: ParsedCandidate = latest.parsed;
        if (latest.parsedV2) {
          const projected = v2ToParsedCandidate(latest.parsedV2);
          if (projected.ok) flat = projected.data;
        }
        const aligned = alignParsedCandidateWithAtsSignals({
          parsed: flat,
          legacyHints: hints,
          row,
          explicitParsedArtifact,
        });
        return {
          ok: true,
          parsed: aligned.parsed,
          parsedV2: latest.parsedV2 ?? null,
          legacyParserHints: aligned.legacyHints,
        };
      }
      return { ok: false, reason: `v2_unavailable:${v2FailureReason ?? "unknown"}` };
    }

    // Final corruption check on the v2 document itself; if still corrupted, refuse to persist.
    const finalDocCheck = v2DocumentLikelyCorrupted(richV2, {
      min: v2ProvMin,
      median: v2ProvMedian,
    });
    const finalFlatCorrupt = parsedCandidateLikelyCorrupted(parsedOut);
    if (!finalDocCheck.ok || finalFlatCorrupt) {
      const reasons: string[] = [
        ...(finalDocCheck.ok ? [] : finalDocCheck.reasons),
        ...(finalFlatCorrupt ? ["parsed_candidate_likely_corrupted_after_rescue"] : []),
      ];
      log("warn", "cie_snapshot_rejected", {
        candidate_id: params.candidateId,
        reasons,
        parser_source: "strict_v2",
        had_prior_snapshot: Boolean(latest),
        had_prior_v2: Boolean(latest?.parsedV2),
      });
      if (latest) {
        let flat: ParsedCandidate = latest.parsed;
        if (latest.parsedV2) {
          const projected = v2ToParsedCandidate(latest.parsedV2);
          if (projected.ok) flat = projected.data;
        }
        const aligned = alignParsedCandidateWithAtsSignals({
          parsed: flat,
          legacyHints: hints,
          row,
          explicitParsedArtifact,
        });
        return {
          ok: true,
          parsed: aligned.parsed,
          parsedV2: latest.parsedV2 ?? null,
          legacyParserHints: aligned.legacyHints,
        };
      }
      return {
        ok: false,
        reason: `v2_corrupted_no_prior_snapshot:${reasons.join(",")}`,
      };
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
      parsedV2: richV2,
      sourceResumeContentHash: resolveCieParsedSnapshotDedupeKey(contentHashForDedupe),
    });
    log("info", "cie_snapshot_persisted", {
      candidate_id: params.candidateId,
      parser_source: "strict_v2",
      raw_chars: v2RawChars,
      used_chars: v2UsedChars,
      truncated: v2Truncated,
      prov_min: v2ProvMin,
      prov_median: v2ProvMedian,
      skills: aligned.parsed.skills.length,
      experience: aligned.parsed.experience.length,
      education: aligned.parsed.education.length,
    });
    return {
      ok: true,
      parsed: aligned.parsed,
      parsedV2: richV2,
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

/**
 * Force-persist a rich v2 parse + flat ParsedCandidate snapshot for CIE (write-through).
 * Bypasses RESUME_STRUCTURE_V2_ENABLED for explicit operator/API intent.
 */
export async function materializeCandidateCieV2Snapshot(params: {
  organizationId: string;
  candidateId: number;
}): Promise<
  | { ok: true; snapshotId: number; version: number }
  | { ok: false; reason: string }
> {
  const row = await selectCandidateById(params.candidateId, params.organizationId);
  if (!row) {
    return { ok: false, reason: "candidate_not_found" };
  }

  let effectiveContentHash = row.resumeContentHash ?? null;
  let legacyHints: LegacyParsedDataHints | null = null;

  let resolved: Awaited<ReturnType<typeof resolveLegacyResumeArtifactForCandidate>> | null =
    null;
  if (row.resumePath?.trim()) {
    resolved = await resolveLegacyResumeArtifactForCandidate(row);
    if (resolved?.artifact.status === "processed") {
      const pd =
        resolved.artifact.parsedData &&
        typeof resolved.artifact.parsedData === "object" &&
        resolved.artifact.parsedData !== null
          ? (resolved.artifact.parsedData as Record<string, unknown>)
          : {};
      legacyHints = legacyParsedDataHints(pd);
    }

    if (resolved && !resolved.fromCache) {
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
  }

  const rawSource = resolved ? resolved.cacheRec : row.resumeParseCache;
  const rawText = resumeParseCacheRawText(rawSource);
  if (!rawText?.trim()) {
    return { ok: false, reason: "no_resume_text" };
  }

  const v2 = await runStrictResumeV2FromText({
    resumeText: rawText,
    logContext: { candidate_id: params.candidateId, path: "materialize_cie_v2" },
    bypassResumeStructureV2EnabledGate: true,
  });
  if (!v2.ok) {
    return { ok: false, reason: `v2_failed:${v2.reason}` };
  }
  if (v2.truncated) {
    log("warn", "cie_truncation_detected", {
      candidate_id: params.candidateId,
      raw_chars: v2.rawChars,
      used_chars: v2.usedChars,
      path: "materialize_cie_v2",
    });
  }

  const mapped = v2ToParsedCandidate(v2.data);
  if (!mapped.ok) {
    return { ok: false, reason: `v2_map_failed:${mapped.reason}` };
  }

  const docCheck = v2DocumentLikelyCorrupted(v2.data, {
    min: v2.provMin,
    median: v2.provMedian,
  });
  const flatCorrupt = parsedCandidateLikelyCorrupted(mapped.data);
  if (!docCheck.ok || flatCorrupt) {
    const reasons = [
      ...(docCheck.ok ? [] : docCheck.reasons),
      ...(flatCorrupt ? ["parsed_candidate_likely_corrupted"] : []),
    ];
    log("warn", "cie_snapshot_rejected", {
      candidate_id: params.candidateId,
      reasons,
      parser_source: "strict_v2",
      path: "materialize_cie_v2",
    });
    return { ok: false, reason: `v2_corrupted:${reasons.join(",")}` };
  }

  const aligned = alignParsedCandidateWithAtsSignals({
    parsed: mapped.data,
    legacyHints,
    row,
    explicitParsedArtifact:
      resolved?.artifact.status === "processed" ? resolved.artifact : undefined,
  });

  const snapshotId = await cieRepo.insertParsedDataRow({
    organizationId: params.organizationId,
    candidateId: params.candidateId,
    parsed: aligned.parsed,
    parsedV2: v2.data,
    sourceResumeContentHash: resolveCieParsedSnapshotDedupeKey(effectiveContentHash),
  });
  if (!snapshotId) {
    return { ok: false, reason: "insert_failed" };
  }
  log("info", "cie_snapshot_persisted", {
    candidate_id: params.candidateId,
    parser_source: "strict_v2",
    raw_chars: v2.rawChars,
    used_chars: v2.usedChars,
    truncated: v2.truncated,
    prov_min: v2.provMin,
    prov_median: v2.provMedian,
    skills: aligned.parsed.skills.length,
    experience: aligned.parsed.experience.length,
    education: aligned.parsed.education.length,
    path: "materialize_cie_v2",
  });

  const latest = await cieRepo.selectLatestParsedRow(
    params.candidateId,
    params.organizationId,
  );
  if (!latest) {
    return { ok: false, reason: "read_after_write_failed" };
  }

  return { ok: true, snapshotId: latest.id, version: latest.version };
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
      parsedV2: parsedResult.parsedV2 ?? null,
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
    parsedV2: parsedResult.parsedV2 ?? null,
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
