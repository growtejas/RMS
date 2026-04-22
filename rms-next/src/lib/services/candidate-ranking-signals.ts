import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";
import { normalizeSkill } from "@/lib/services/ats-v1-scoring";
import {
  RESUME_STRUCTURE_SCHEMA_VERSION,
  type ResumeStructuredDocumentV1,
} from "@/lib/services/resume-structure/resume-structure.schema";

/** Where an ATS-facing field value came from after DB + parser + structured merge. */
export type SignalFieldSource = "db" | "structured" | "parser" | "none";

export type CandidateRankingSignalsAts = {
  experience_years: number | null;
  experience_source: SignalFieldSource;
  notice_period_days: number | null;
  notice_source: SignalFieldSource;
  education_raw: string | null;
  education_source: SignalFieldSource;
};

/**
 * Canonical inputs for ranking / ATS after merging DB candidate + resume parse.
 * Scoring code should prefer this over reading `parsedData` or DB columns directly.
 */
export type CandidateRankingSignals = {
  /** Merged structured skills (DB JSON + parser), normalized tokens. */
  skills_normalized: string[];
  /** Extracted resume body when parse status is `processed`; otherwise null. */
  resume_plain_text: string | null;
  parse_status: ParsedResumeArtifact["status"] | "skipped";
  /** Values passed to ATS V1 (DB wins; parser fills gaps). */
  ats: CandidateRankingSignalsAts;
  /** Full structured document when available (for explain / debugging). */
  structured_document?: ResumeStructuredDocumentV1 | null;
};

/** Compact shape for ranking API / score breakdown JSON. */
export type CandidateRankingSignalsExplain = {
  parse_status: CandidateRankingSignals["parse_status"];
  skills_count: number;
  skills_sample: string[];
  ats: CandidateRankingSignalsAts;
  resume_plain_text_length: number | null;
  /** Versioned structured profile when present (rules v2 / LLM). */
  structured_resume?: {
    schema_version: number;
    extractor: string;
    confidence_overall: number;
    warnings_sample: string[];
  } | null;
};

function readFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readFiniteInt(v: unknown): number | null {
  const n = readFiniteNumber(v);
  if (n == null) return null;
  return Math.trunc(n);
}

function readTrimmedString(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, maxLen);
  return t ? t : null;
}

type ParserExtract = {
  skills: string[];
  experience_years: number | null;
  notice_period_days: number | null;
  education_raw: string | null;
};

function extractFromParsedData(parsed: ParsedResumeArtifact | null): ParserExtract {
  if (!parsed || parsed.status !== "processed") {
    return {
      skills: [],
      experience_years: null,
      notice_period_days: null,
      education_raw: null,
    };
  }
  const pd = parsed.parsedData ?? {};
  const skillsRaw = pd.skills;
  const skills = Array.isArray(skillsRaw)
    ? (skillsRaw as unknown[])
        .filter((s): s is string => typeof s === "string")
        .map((s) => normalizeSkill(s))
        .filter(Boolean)
    : [];
  return {
    skills: Array.from(new Set(skills)),
    experience_years: readFiniteNumber(pd.experience_years),
    notice_period_days: readFiniteInt(pd.notice_period_days),
    education_raw: readTrimmedString(pd.education_raw, 500),
  };
}

function dbExperienceYears(totalExperienceYears: unknown): number | null {
  if (totalExperienceYears == null) return null;
  const n = Number(totalExperienceYears);
  return Number.isFinite(n) ? n : null;
}

/** Structured document is trusted for ranking merge when parse succeeded and schema matches. */
function structuredRankingUsable(
  doc: ResumeStructuredDocumentV1 | null | undefined,
  parse_status: ParsedResumeArtifact["status"] | "skipped",
): boolean {
  return (
    doc != null &&
    parse_status === "processed" &&
    doc.schema_version === RESUME_STRUCTURE_SCHEMA_VERSION
  );
}

export function buildCandidateRankingSignals(input: {
  candidate: {
    candidateSkills: unknown;
    totalExperienceYears: unknown;
    noticePeriodDays: number | null;
    educationRaw: string | null;
  };
  parsedArtifact: ParsedResumeArtifact | null;
  /** Canonical structured profile (DB and/or freshly computed in ranking). */
  structuredDocument?: ResumeStructuredDocumentV1 | null;
}): CandidateRankingSignals {
  const p = extractFromParsedData(input.parsedArtifact);
  const parse_status = input.parsedArtifact?.status ?? "skipped";
  const struct = input.structuredDocument?.profile;

  const structSkills = (struct?.skills ?? [])
    .filter((s): s is string => typeof s === "string")
    .map((s) => normalizeSkill(s))
    .filter(Boolean);

  const dbSkills = Array.isArray(input.candidate.candidateSkills)
    ? input.candidate.candidateSkills
        .filter((s): s is string => typeof s === "string")
        .map((s) => normalizeSkill(s))
        .filter(Boolean)
    : [];
  const rankingUsable = structuredRankingUsable(input.structuredDocument, parse_status);
  const skills_normalized =
    rankingUsable && structSkills.length > 0
      ? Array.from(new Set(structSkills))
      : Array.from(new Set([...dbSkills, ...structSkills, ...p.skills]));

  let experience_years: number | null = null;
  let experience_source: SignalFieldSource = "none";
  if (rankingUsable && struct?.experience_years != null) {
    experience_years = struct.experience_years;
    experience_source = "structured";
  } else {
    const dbExp = dbExperienceYears(input.candidate.totalExperienceYears);
    if (dbExp != null) {
      experience_years = dbExp;
      experience_source = "db";
    } else if (struct?.experience_years != null) {
      experience_years = struct.experience_years;
      experience_source = "structured";
    } else if (p.experience_years != null) {
      experience_years = p.experience_years;
      experience_source = "parser";
    }
  }

  const dbNotice = input.candidate.noticePeriodDays;
  let notice_period_days: number | null =
    dbNotice != null && Number.isFinite(dbNotice) ? Math.trunc(Number(dbNotice)) : null;
  let notice_source: SignalFieldSource = notice_period_days != null ? "db" : "none";
  if (notice_period_days == null && struct?.notice_period_days != null) {
    notice_period_days = Math.trunc(struct.notice_period_days);
    notice_source = "structured";
  }
  if (notice_period_days == null && p.notice_period_days != null) {
    notice_period_days = p.notice_period_days;
    notice_source = "parser";
  }

  const dbEdu = input.candidate.educationRaw?.trim() ?? "";
  let education_raw: string | null = null;
  let education_source: SignalFieldSource = "none";
  if (rankingUsable && struct?.education?.trim()) {
    education_raw = struct.education.trim().slice(0, 2000);
    education_source = "structured";
  } else if (dbEdu) {
    education_raw = dbEdu;
    education_source = "db";
  } else if (struct?.education?.trim()) {
    education_raw = struct.education.trim().slice(0, 2000);
    education_source = "structured";
  } else if (p.education_raw) {
    education_raw = p.education_raw;
    education_source = "parser";
  }

  const resume_plain_text =
    input.parsedArtifact?.status === "processed"
      ? (input.parsedArtifact.rawText ?? null)
      : null;

  return {
    skills_normalized,
    resume_plain_text,
    parse_status,
    ats: {
      experience_years,
      experience_source,
      notice_period_days,
      notice_source,
      education_raw,
      education_source,
    },
    structured_document: input.structuredDocument ?? null,
  };
}

export function rankingSignalsToExplain(s: CandidateRankingSignals): CandidateRankingSignalsExplain {
  const doc = s.structured_document;
  return {
    parse_status: s.parse_status,
    skills_count: s.skills_normalized.length,
    skills_sample: s.skills_normalized.slice(0, 25),
    ats: s.ats,
    resume_plain_text_length: s.resume_plain_text?.length ?? null,
    structured_resume: doc
      ? {
          schema_version: doc.schema_version,
          extractor: doc.extractor,
          confidence_overall: doc.confidence.overall,
          warnings_sample: doc.warnings.slice(0, 8),
        }
      : null,
  };
}
