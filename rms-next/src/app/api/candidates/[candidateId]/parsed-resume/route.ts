import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import {
  batchUpdateResumeParseCache,
  selectCandidateById,
} from "@/lib/repositories/candidates-repo";
import { resolveLegacyResumeArtifactForCandidate } from "@/lib/services/cie/cie-legacy-resume-parse";
import {
  resolveCieParserSource,
} from "@/lib/services/cie/cie-llm";
import {
  legacyParsedDataHints,
  tryBuildParsedCandidateFromLegacyParsedData,
  type LegacyParsedDataHints,
} from "@/lib/services/cie/parsed-candidate-from-legacy-parsed-data";
import { tryBuildParsedCandidateFromStructuredUnknown } from "@/lib/services/cie/parsed-candidate-from-resume-structure";
import type { ParsedCandidate } from "@/lib/services/cie/cie.schema";
import {
  contentHashFromArtifact,
  resumeParseCacheRawText,
  resumeParseCacheToApiRecord,
} from "@/lib/services/resume-parse-cache";
import {
  resolveResumeStructureV2Enabled,
  runStrictResumeV2FromText,
} from "@/lib/services/resume-structure/strict-resume-v2-llm";
import {
  v2CoreSummary,
  v2ToProcessorPayload,
  v2ToParsedCandidate,
  type V2CoreSummary,
  type V2ProcessorPayload,
} from "@/lib/services/resume-structure/strict-resume-v2-mapper";
import type { StrictResumeV2 } from "@/lib/services/resume-structure/strict-resume-v2.schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { candidateId: string } };

function parseId(s: string): number | NextResponse {
  const id = Number.parseInt(s, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ detail: "Invalid candidate id" }, { status: 422 });
  }
  return id;
}

function emptyHints(): LegacyParsedDataHints {
  return { experience_years: null, notice_period_days: null };
}

function readV2QueryFlag(req: Request): boolean {
  try {
    const url = new URL(req.url);
    const v = url.searchParams.get("v2");
    if (v == null) return false;
    const t = v.trim().toLowerCase();
    return t === "1" || t === "true" || t === "yes";
  } catch {
    return false;
  }
}

function readDebugQueryFlag(req: Request): boolean {
  try {
    const url = new URL(req.url);
    const v = url.searchParams.get("debug");
    if (v == null) return false;
    const t = v.trim().toLowerCase();
    return t === "1" || t === "true" || t === "yes";
  } catch {
    return false;
  }
}

function readViewMode(req: Request): "full" | "v2" {
  try {
    const url = new URL(req.url);
    const v = url.searchParams.get("view")?.trim().toLowerCase();
    return v === "v2" ? "v2" : "full";
  } catch {
    return "full";
  }
}

/**
 * GET /api/candidates/{id}/parsed-resume
 * - `resume_parse` / `parsed_candidate`: legacy fallback-local v2 + CIE projection
 * - `parsed_candidate_structured`: rules/structured profile → CIE shape (richer jobs/education when present)
 * - `cie_effective_*`: which snapshot matches `CIE_PARSER_SOURCE` + fallbacks (read-only preview; no DB writes)
 * - `parsed_candidate_v2*`: adaptive v2 (UI/debug only). Returned when env `RESUME_STRUCTURE_V2_ENABLED=true`
 *   or the request carries `?v2=1`. Never persisted, never used by ATS or CIE pipeline.
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(_req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const candidateId = parseId(params.candidateId);
    if (candidateId instanceof NextResponse) {
      return candidateId;
    }

    const row = await selectCandidateById(candidateId, user.organizationId);
    if (!row) {
      return NextResponse.json({ detail: "Candidate not found" }, { status: 404 });
    }

    const hasResumePath = Boolean(row.resumePath?.trim());
    const resolved = hasResumePath
      ? await resolveLegacyResumeArtifactForCandidate(row)
      : null;

    if (resolved && !resolved.fromCache) {
      const hash = contentHashFromArtifact(resolved.artifact);
      await batchUpdateResumeParseCache([
        {
          candidateId,
          resumeParseCache: { ...resolved.cacheRec } as Record<string, unknown>,
          resumeContentHash: hash ?? undefined,
        },
      ]);
    }

    const resumeParseRecord = resolved
      ? resumeParseCacheToApiRecord(resolved.cacheRec as unknown)
      : resumeParseCacheToApiRecord(row.resumeParseCache);

    let parsedCandidate: ParsedCandidate | null = null;
    let parsedCandidateError: string | null = null;
    let legacyHints = emptyHints();
    let fromCache = resolved?.fromCache ?? false;

    if (resolved?.artifact.status === "processed") {
      const pd =
        resolved.artifact.parsedData &&
        typeof resolved.artifact.parsedData === "object" &&
        resolved.artifact.parsedData !== null
          ? (resolved.artifact.parsedData as Record<string, unknown>)
          : {};
      const built = tryBuildParsedCandidateFromLegacyParsedData(pd);
      legacyHints = legacyParsedDataHints(pd);
      if (built.ok) {
        parsedCandidate = built.data;
      } else {
        parsedCandidateError = built.reason;
      }
    } else if (hasResumePath && resolved) {
      parsedCandidateError = `legacy_parse_failed:${resolved.artifact.status}`;
    } else if (!hasResumePath) {
      parsedCandidateError = "no_resume_path";
    }

    const structuredBuilt = tryBuildParsedCandidateFromStructuredUnknown(
      row.resumeStructuredProfile,
    );
    const parsedCandidateStructured = structuredBuilt.ok ? structuredBuilt.data : null;
    const parsedCandidateStructuredError = structuredBuilt.ok
      ? null
      : structuredBuilt.reason;

    const src = resolveCieParserSource();
    let cieEffectiveParsedCandidate: ParsedCandidate | null = null;
    let cieEffectiveSource: "legacy" | "structured" | null = null;
    let cieEffectiveLegacyHints: LegacyParsedDataHints | null = null;

    const legacyOk = parsedCandidate;
    const structOk = parsedCandidateStructured;

    if (src === "structured") {
      if (structOk) {
        cieEffectiveParsedCandidate = structOk;
        cieEffectiveSource = "structured";
      } else if (legacyOk) {
        cieEffectiveParsedCandidate = legacyOk;
        cieEffectiveSource = "legacy";
        cieEffectiveLegacyHints = legacyHints;
      }
    } else {
      if (legacyOk) {
        cieEffectiveParsedCandidate = legacyOk;
        cieEffectiveSource = "legacy";
        cieEffectiveLegacyHints = legacyHints;
      } else if (structOk) {
        cieEffectiveParsedCandidate = structOk;
        cieEffectiveSource = "structured";
      }
    }

    let parsedCandidateV2: StrictResumeV2 | null = null;
    let parsedCandidateV2Error: string | null = null;
    let parsedCandidateV2Preview: ParsedCandidate | null = null;
    let parsedCandidateV2Summary: V2CoreSummary | null = null;
    let parsedCandidateV2ProcessorPayload: V2ProcessorPayload | null = null;
    const v2QueryRequested = readV2QueryFlag(_req);
    const v2EnvOn = resolveResumeStructureV2Enabled();
    if (v2QueryRequested || v2EnvOn) {
      const rawCacheSource = resolved
        ? (resolved.cacheRec as unknown)
        : row.resumeParseCache;
      const rawText = resumeParseCacheRawText(rawCacheSource);
      if (!rawText) {
        parsedCandidateV2Error = "no_raw_text";
      } else {
        const r = await runStrictResumeV2FromText({
          resumeText: rawText,
          logContext: { candidate_id: candidateId, path: "parsed_resume_v2" },
        });
        if (r.ok) {
          parsedCandidateV2 = r.data;
          parsedCandidateV2Summary = v2CoreSummary(r.data);
          const orgIdNum = Number(user.organizationId);
          parsedCandidateV2ProcessorPayload = v2ToProcessorPayload({
            doc: r.data,
            candidateId,
            requisitionId: row.requisitionId ?? null,
            organizationId: Number.isFinite(orgIdNum) ? orgIdNum : null,
          });
          const proj = v2ToParsedCandidate(r.data);
          if (proj.ok) {
            parsedCandidateV2Preview = proj.data;
          }
        } else {
          parsedCandidateV2Error = `v2_failed:${r.reason}`;
        }
      }
    }

    const viewMode = readViewMode(_req);
    const debug = readDebugQueryFlag(_req);
    const isV2Slim = viewMode === "v2" && !debug;

    const body: Record<string, unknown> = {
      detail: !hasResumePath ? "No resume_path on candidate; legacy parse skipped." : undefined,
      resume_parse: resumeParseRecord,
      parsed_candidate_v2: parsedCandidateV2,
      parsed_candidate_v2_error: parsedCandidateV2Error,
      parsed_candidate_v2_preview: parsedCandidateV2Preview,
      parsed_candidate_v2_summary: parsedCandidateV2Summary,
      parsed_candidate_v2_processor_payload: parsedCandidateV2ProcessorPayload,
      from_cache: fromCache,
    };
    if (!isV2Slim) {
      body.parsed_candidate = parsedCandidate;
      body.parsed_candidate_error = parsedCandidateError;
      body.parsed_candidate_structured = parsedCandidateStructured;
      body.parsed_candidate_structured_error = parsedCandidateStructuredError;
      body.legacy_parser_hints = legacyHints;
      body.cie_parser_source = src;
      body.cie_effective_parsed_candidate = cieEffectiveParsedCandidate;
      body.cie_effective_source = cieEffectiveSource;
      body.cie_effective_legacy_hints = cieEffectiveLegacyHints;
    }
    if (body.detail === undefined) {
      delete body.detail;
    }

    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/candidates/[candidateId]/parsed-resume]");
  }
}
