import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";
import type { CandidateRow } from "@/lib/repositories/candidates-repo";
import { buildCandidateRankingSignals } from "@/lib/services/candidate-ranking-signals";
import { cacheRecordToParsedArtifact } from "@/lib/services/resume-parse-cache";
import { parseResumeStructuredDocument } from "@/lib/services/resume-structure/resume-structure.schema";
import type { ParsedCandidate } from "@/lib/services/cie/cie.schema";
import type { LegacyParsedDataHints } from "@/lib/services/cie/parsed-candidate-from-legacy-parsed-data";

function educationRowFromRaw(raw: string): ParsedCandidate["education"] {
  const t = raw.trim();
  if (!t) return [];
  const m = t.match(/\b(19|20)\d{2}\b/);
  const year = m ? Number.parseInt(m[0]!, 10) : null;
  return [
    {
      degree: t.length > 300 ? `${t.slice(0, 297)}…` : t,
      specialization: null,
      university: "—",
      year: year != null && Number.isFinite(year) ? year : null,
      score: null,
    },
  ];
}

/**
 * Applies the same DB + parser + structured merge as ATS ranking (`buildCandidateRankingSignals`)
 * onto a CIE `ParsedCandidate` so the LLM sees skills / contact / hints consistent with scoring.
 */
export function alignParsedCandidateWithAtsSignals(input: {
  parsed: ParsedCandidate;
  legacyHints: LegacyParsedDataHints | null;
  row: CandidateRow;
  /**
   * `undefined` — use `resume_parse_cache` (same as GET /api/candidates/:id).
   * Non-null — use this artifact (e.g. freshly parsed in CIE legacy path).
   */
  explicitParsedArtifact?: ParsedResumeArtifact | null;
}): { parsed: ParsedCandidate; legacyHints: LegacyParsedDataHints | null } {
  const parsedArtifact =
    input.explicitParsedArtifact === undefined
      ? (cacheRecordToParsedArtifact(input.row.resumeParseCache) ?? null)
      : input.explicitParsedArtifact;

  const structuredFromDb = parseResumeStructuredDocument(input.row.resumeStructuredProfile);
  const structuredDocument = structuredFromDb.ok ? structuredFromDb.data : null;

  const signals = buildCandidateRankingSignals({
    candidate: {
      candidateSkills: input.row.candidateSkills,
      totalExperienceYears: input.row.totalExperienceYears,
      noticePeriodDays: input.row.noticePeriodDays,
      educationRaw: input.row.educationRaw,
    },
    parsedArtifact,
    structuredDocument,
  });

  const mergedHints: LegacyParsedDataHints = {
    experience_years:
      signals.ats.experience_years ?? input.legacyHints?.experience_years ?? null,
    notice_period_days:
      signals.ats.notice_period_days ?? input.legacyHints?.notice_period_days ?? null,
  };

  let parsed = input.parsed;

  if (signals.skills_normalized.length > 0) {
    parsed = { ...parsed, skills: signals.skills_normalized };
  }

  parsed = {
    ...parsed,
    basicInfo: {
      name: parsed.basicInfo.name?.trim() || input.row.fullName?.trim() || null,
      email: parsed.basicInfo.email?.trim() || input.row.email?.trim() || null,
      phone: parsed.basicInfo.phone?.trim() || input.row.phone?.trim() || null,
    },
  };

  const eduRaw = signals.ats.education_raw?.trim();
  if (eduRaw && parsed.education.length === 0) {
    parsed = { ...parsed, education: educationRowFromRaw(eduRaw) };
  }

  const legacyHintsOut =
    mergedHints.experience_years != null || mergedHints.notice_period_days != null
      ? mergedHints
      : null;

  return { parsed, legacyHints: legacyHintsOut };
}
