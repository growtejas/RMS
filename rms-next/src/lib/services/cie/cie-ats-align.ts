import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";
import type { CandidateRow } from "@/lib/repositories/candidates-repo";
import { log } from "@/lib/logging/logger";
import { buildCandidateRankingSignals } from "@/lib/services/candidate-ranking-signals";
import { normalizeSkill } from "@/lib/services/ats-v1-scoring";
import { cacheRecordToParsedArtifact } from "@/lib/services/resume-parse-cache";
import { parseResumeStructuredDocument } from "@/lib/services/resume-structure/resume-structure.schema";
import type { ParsedCandidate } from "@/lib/services/cie/cie.schema";
import type { LegacyParsedDataHints } from "@/lib/services/cie/parsed-candidate-from-legacy-parsed-data";

/** Maximum size of the merged skills array (keeps `parsedCandidateZ.skills.max(80)` happy). */
const MERGED_SKILLS_CAP = 80;

/**
 * Canonical merge policy: v2 skills are authoritative. ATS-only skills are appended
 * (case-insensitive dedupe), normalized via `normalizeSkill`, and the result is capped
 * at the same limit `parsedCandidateZ.skills` enforces.
 *
 * IMPORTANT: never overwrite v2 skills with ATS signals. The previous policy
 * (replace-on-non-empty) caused legacy/structured/DB skills to clobber high-quality
 * v2 extractions.
 */
export function mergeAtsSkillsWithV2(
  v2Skills: readonly string[],
  atsSkills: readonly string[],
): { merged: string[]; v2Count: number; atsCount: number; atsAdded: number; dropped: number } {
  const seen = new Set<string>();
  const out: string[] = [];

  let dropped = 0;
  for (const raw of v2Skills) {
    const norm = normalizeSkill(raw);
    if (!norm) {
      dropped += 1;
      continue;
    }
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
    if (out.length >= MERGED_SKILLS_CAP) break;
  }

  let atsAdded = 0;
  if (out.length < MERGED_SKILLS_CAP) {
    for (const raw of atsSkills) {
      const norm = normalizeSkill(raw);
      if (!norm) {
        dropped += 1;
        continue;
      }
      const key = norm.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(norm);
      atsAdded += 1;
      if (out.length >= MERGED_SKILLS_CAP) break;
    }
  }

  return {
    merged: out,
    v2Count: v2Skills.length,
    atsCount: atsSkills.length,
    atsAdded,
    dropped,
  };
}

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

  // CANONICAL POLICY: v2 skills are authoritative. ATS-only skills append (deduped).
  const merged = mergeAtsSkillsWithV2(parsed.skills ?? [], signals.skills_normalized);
  if (merged.merged.length > 0) {
    parsed = { ...parsed, skills: merged.merged };
  }
  log("info", "cie_skill_merge", {
    v2_count: merged.v2Count,
    ats_count: merged.atsCount,
    ats_added: merged.atsAdded,
    final_count: merged.merged.length,
    dropped: merged.dropped,
  });

  parsed = {
    ...parsed,
    basicInfo: {
      name: parsed.basicInfo.name?.trim() || input.row.fullName?.trim() || null,
      email: parsed.basicInfo.email?.trim() || input.row.email?.trim() || null,
      phone: parsed.basicInfo.phone?.trim() || input.row.phone?.trim() || null,
    },
  };

  // Only inject synthetic education when v2 produced zero rows.
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
