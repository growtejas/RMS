import { normalizeSkill } from "@/lib/services/ats-v1-scoring";
import type { ParsedCandidateProfile } from "@/lib/services/resume-structure/resume-structure.schema";

function readNumericExp(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Merge policy: **DB / form values win** for fields the user or system already set.
 * Structured profile fills gaps (same precedence as ranking: DB → structured → legacy parser).
 */
export function mergeStructuredProfileForPersist(input: {
  /** Existing DB values when updating a candidate (null for insert-only path). */
  existing: {
    candidateSkills: string[] | null | undefined;
    totalExperienceYears: unknown;
    noticePeriodDays: number | null | undefined;
    educationRaw: string | null | undefined;
  } | null;
  /** Legacy `toParsedData` / inbound parsed fields. */
  parsed: {
    skills: string[];
    experienceYears: number | null;
    noticeDays: number | null;
    educationRaw: string | null;
  };
  structured: ParsedCandidateProfile | null;
}): {
  candidateSkills: string[] | null;
  totalExperienceYears: string | null;
  noticePeriodDays: number | null;
  educationRaw: string | null;
} {
  const skillSet = new Set<string>();
  for (const s of input.existing?.candidateSkills ?? []) {
    const n = normalizeSkill(String(s));
    if (n) skillSet.add(n);
  }
  for (const s of input.parsed.skills) {
    const n = normalizeSkill(s);
    if (n) skillSet.add(n);
  }
  for (const s of input.structured?.skills ?? []) {
    const n = normalizeSkill(s);
    if (n) skillSet.add(n);
  }
  const candidateSkills = skillSet.size > 0 ? Array.from(skillSet).slice(0, 80) : null;

  const existingExp = readNumericExp(input.existing?.totalExperienceYears);
  let experienceYears: number | null = existingExp;
  if (experienceYears == null) {
    experienceYears = input.parsed.experienceYears;
  }
  if (experienceYears == null && input.structured?.experience_years != null) {
    experienceYears = input.structured.experience_years;
  }

  let noticePeriodDays: number | null =
    input.existing?.noticePeriodDays != null && Number.isFinite(input.existing.noticePeriodDays)
      ? Math.trunc(Number(input.existing.noticePeriodDays))
      : null;
  if (noticePeriodDays == null && input.structured?.notice_period_days != null) {
    noticePeriodDays = Math.trunc(input.structured.notice_period_days);
  }
  if (noticePeriodDays == null && input.parsed.noticeDays != null) {
    noticePeriodDays = input.parsed.noticeDays;
  }

  let educationRaw = input.existing?.educationRaw?.trim() || null;
  if (!educationRaw && input.structured?.education?.trim()) {
    educationRaw = input.structured.education.trim().slice(0, 2000);
  }
  if (!educationRaw && input.parsed.educationRaw) {
    educationRaw = input.parsed.educationRaw;
  }

  return {
    candidateSkills,
    totalExperienceYears: experienceYears != null ? String(experienceYears) : null,
    noticePeriodDays,
    educationRaw,
  };
}
