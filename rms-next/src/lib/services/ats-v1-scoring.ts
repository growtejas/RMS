/**
 * ATS V1 rule-based scoring as defined in `docs/ATS_Logic` (0–100 + breakdown).
 *
 * Core dimensions: experience / notice / education / seniority.
 * When the ranker supplies **structured required skills** for the item, the same
 * matched/required counts used for the skill gate also **align** ATS V1 (multiplier)
 * and populate `explain.ats_v1` skill fields for consistency.
 */
export type AtsV1Breakdown = {
  experience: number; // 0..1
  notice: number; // 0..1
  education: number; // 0..1
  seniority: number; // 0..1
  score_0_100: number; // 0..100
  partial_data: boolean;
  flags: string[];
  /** 0..1 when structured required skills exist; otherwise undefined. */
  skills_alignment?: number;
  matched_skills_count?: number;
  required_skills_count?: number;
};

export type SeniorityBand = "JUNIOR" | "MID" | "SENIOR";

const WEIGHT_EXPERIENCE = 0.4;
const WEIGHT_NOTICE = 0.25;
const WEIGHT_EDUCATION = 0.15;
const WEIGHT_SENIORITY = 0.2;

const PARTIAL_DATA_PENALTY = 0.85;
/** Applied when exactly one ATS dimension is missing (milder than multi-field gap). */
const SINGLE_FIELD_MISSING_PENALTY = 0.92;
const EXTREME_MISMATCH_PENALTY = 0.7;
/** When structured required skills exist: score *= floor + (1-floor)*matchRatio (100% match => no change). */
const AT_V1_SKILL_ALIGN_FLOOR = 0.82;

export function normalizeSkillToken(raw: string): string {
  const k0 = raw.trim().toLowerCase();
  if (!k0) return "";
  const k = k0
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const builtin: Record<string, string> = {
    "react js": "react",
    reactjs: "react",
    "react.js": "react",
    "node js": "node",
    nodejs: "node",
    "node.js": "node",
    js: "javascript",
    ts: "typescript",
    "next js": "nextjs",
    "next.js": "nextjs",
    sklearn: "scikit learn",
    "power bi": "power bi",
    powerbi: "power bi",
    beautifulsoup: "beautiful soup",
  };
  return builtin[k] ?? k;
}

/** Public alias for required + candidate skill lists (same rules as `normalizeSkillToken`). */
export function normalizeSkill(raw: string): string {
  return normalizeSkillToken(raw);
}

export function resolveRequiredSkillsFromItem(input: {
  rankingRequiredSkills: unknown;
  requirements: string | null;
}): string[] {
  const fromJson = input.rankingRequiredSkills;
  if (Array.isArray(fromJson) && fromJson.length > 0) {
    const out = fromJson
      .filter((s): s is string => typeof s === "string")
      .map((s) => normalizeSkillToken(s))
      .filter(Boolean);
    return Array.from(new Set(out));
  }
  const req = input.requirements ?? "";
  const primary =
    req.match(/Primary Skill:\s*([^|]+)/i)?.[1]?.split(",") ?? [];
  const secondary =
    req.match(/Secondary Skills:\s*([^|]+)/i)?.[1]?.split(",") ?? [];
  const merged = [...primary, ...secondary]
    .map((s) => normalizeSkillToken(s))
    .filter(Boolean);
  // Remove obviously generic labels that show up in some formatted JDs.
  const filtered = merged.filter((s) => {
    const k = s.trim().toLowerCase();
    return k !== "primary" && k !== "secondary" && k !== "skill" && k !== "skills";
  });
  return Array.from(new Set(filtered));
}

const JD_NARRATIVE_SKILL_STOP = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
  "have",
  "has",
  "will",
  "can",
  "you",
  "your",
  "our",
  "are",
  "not",
  "all",
  "any",
  "job",
  "role",
  "position",
  "skills",
  "skill",
  "years",
  "year",
  "work",
  "team",
  "must",
  "good",
  "strong",
  "able",
  "well",
  "using",
  "used",
]);

/** Last-resort tokens from full JD narrative when structured fields are empty. */
export function extractSkillTokensFromJdNarrative(text: string, maxSkills: number): string[] {
  const lower = text.toLowerCase();
  const raw = lower.match(/[a-z0-9+#.]{2,}/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (t.length < 3 || JD_NARRATIVE_SKILL_STOP.has(t) || /^\d+(\.\d+)?$/.test(t)) {
      continue;
    }
    const n = normalizeSkillToken(t);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= maxSkills) break;
  }
  return out;
}

/**
 * Required skills for ranking: JSON / Primary-Secondary lines first, then same patterns on full JD text,
 * then token extraction from narrative.
 */
export function resolveRequiredSkillsForRanking(input: {
  rankingRequiredSkills: unknown;
  requirements: string | null;
  jdNarrative: string;
  maxNarrativeTokens: number;
}): string[] {
  let list = resolveRequiredSkillsFromItem({
    rankingRequiredSkills: input.rankingRequiredSkills,
    requirements: input.requirements,
  });
  if (list.length > 0) {
    return list;
  }
  const narrative = input.jdNarrative?.trim() ?? "";
  if (narrative.length > 0) {
    list = resolveRequiredSkillsFromItem({
      rankingRequiredSkills: null,
      requirements: narrative,
    });
    if (list.length > 0) {
      return list;
    }
    list = extractSkillTokensFromJdNarrative(narrative, input.maxNarrativeTokens);
  }
  return list;
}

export function resolveRankingAllowEmptyRequiredSkills(): boolean {
  const raw = process.env.RANKING_ALLOW_EMPTY_REQUIRED_SKILLS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

// Note: legacy `skillsRatio` was removed when ATS V1 switched to business-only scoring.

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function experienceComponent(
  candidateYears: number | null | undefined,
  requiredYears: number | null | undefined,
): number {
  const req = requiredYears ?? null;
  const cand = candidateYears ?? null;

  if (req == null || req <= 0) {
    // docs/ATS_Logic: requiredExp = 0 => expScore = 1
    return 1;
  }
  if (cand == null || !Number.isFinite(Number(cand))) {
    // docs/ATS_Logic: missing candidateExp => 0.5
    return 0.5;
  }
  const cy = Number(cand);
  if (cy > 2 * req) {
    // docs/ATS_Logic: if cand > 2x req => expScore = 0.7
    return 0.7;
  }
  return clamp01(cy / req);
}

/** noticePeriodDays: 0 = immediate; null = unknown (0.5). */
function noticeComponent(noticeDays: number | null | undefined): number {
  if (noticeDays == null || !Number.isFinite(noticeDays)) {
    return 0.5;
  }
  const d = Number(noticeDays);
  // docs/ATS_Logic mapping
  if (d <= 0) return 1.0;
  if (d < 15) return 0.9;
  if (d <= 30) return 0.6;
  if (d <= 60) return 0.3;
  if (d <= 90) return 0.2;
  return 0.1;
}

function bandFromExperience(candidateYears: number | null | undefined): SeniorityBand | null {
  if (candidateYears == null || !Number.isFinite(Number(candidateYears))) return null;
  const y = Number(candidateYears);
  if (y < 2) return "JUNIOR";
  if (y < 5) return "MID";
  return "SENIOR";
}

export function bandFromItemSkillLevel(skillLevel: string | null | undefined): SeniorityBand | null {
  const raw = (skillLevel ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("junior") || raw === "jr" || raw.startsWith("jr ")) return "JUNIOR";
  if (raw.includes("senior") || raw === "sr" || raw.startsWith("sr ")) return "SENIOR";
  if (raw.includes("lead") || raw.includes("principal") || raw.includes("staff")) return "SENIOR";
  if (raw.includes("mid")) return "MID";
  if (raw.includes("l1")) return "JUNIOR";
  if (raw.includes("l2")) return "MID";
  if (raw.includes("l3") || raw.includes("l4") || raw.includes("l5")) return "SENIOR";
  return null;
}

function seniorityFitComponent(
  jobBand: SeniorityBand | null,
  candBand: SeniorityBand | null,
): number {
  if (!jobBand || !candBand) return 0.5;
  if (jobBand === candBand) return 1.0;
  const order: SeniorityBand[] = ["JUNIOR", "MID", "SENIOR"];
  const dj = order.indexOf(jobBand);
  const dc = order.indexOf(candBand);
  const diff = Math.abs(dj - dc);
  if (diff === 1) return 0.7;
  return 0.3;
}

function educationComponent(input: {
  candidateEducationRaw: string | null | undefined;
  jobEducationRequirement: string | null | undefined;
}): number {
  // docs/ATS_Logic: default missing education => 0.5
  const job = (input.jobEducationRequirement ?? "").trim().toLowerCase();
  const cand = (input.candidateEducationRaw ?? "").trim().toLowerCase();
  if (!job) return 0.5;
  if (!cand) return 0.5;

  // Simple token overlap match; avoid subjective ranking of institutions.
  const jobTokens = job.split(/[^a-z0-9+]+/).filter(Boolean);
  const candTokens = new Set(cand.split(/[^a-z0-9+]+/).filter(Boolean));
  return jobTokens.some((t) => candTokens.has(t)) ? 1.0 : 0.5;
}

export function computeAtsV1Score(input: {
  candidateExperienceYears: number | null | undefined;
  requiredExperienceYears: number | null | undefined;
  noticePeriodDays: number | null | undefined;
  jobSkillLevel: string | null | undefined;
  jobEducationRequirement: string | null | undefined;
  candidateEducationRaw: string | null | undefined;
  /** Same structured skill counts as ranking skill gate (`resolveRequiredSkillsForRanking` vs `skills_normalized`). */
  structuredSkillMatch?: { requiredCount: number; matchedCount: number } | null;
}): AtsV1Breakdown {
  const flags: string[] = [];
  const reqSkillN = Math.max(
    0,
    Math.trunc(Number(input.structuredSkillMatch?.requiredCount ?? 0)),
  );
  const matSkillN = Math.max(
    0,
    Math.trunc(Number(input.structuredSkillMatch?.matchedCount ?? 0)),
  );

  const experience = experienceComponent(
    input.candidateExperienceYears,
    input.requiredExperienceYears,
  );
  const notice = noticeComponent(input.noticePeriodDays);
  const education = educationComponent({
    candidateEducationRaw: input.candidateEducationRaw,
    jobEducationRequirement: input.jobEducationRequirement,
  });

  const jobBand = bandFromItemSkillLevel(input.jobSkillLevel);
  const candBand = bandFromExperience(input.candidateExperienceYears);
  const seniority = seniorityFitComponent(jobBand, candBand);

  const missingExp = input.candidateExperienceYears == null;
  const missingNotice = input.noticePeriodDays == null;
  const missingEdu =
    (input.jobEducationRequirement ?? "").trim().length > 0 &&
    (input.candidateEducationRaw ?? "").trim().length === 0;
  const missingCount = [missingExp, missingNotice, missingEdu].filter(Boolean).length;

  const partial_data = missingCount >= 1;
  if (missingCount >= 1) {
    flags.push("partial_candidate_data");
  }
  if (missingCount >= 2) {
    flags.push("partial_data");
  }
  if (seniority <= 0.3 && jobBand && candBand && jobBand !== candBand) {
    flags.push("extreme_mismatch");
  }

  let weighted01 =
    WEIGHT_EXPERIENCE * experience +
    WEIGHT_NOTICE * notice +
    WEIGHT_EDUCATION * education +
    WEIGHT_SENIORITY * seniority;

  // docs/ATS_Logic: penalize incomplete candidate signals (merged DB + parser).
  if (missingCount >= 2) {
    weighted01 *= PARTIAL_DATA_PENALTY;
  } else if (missingCount === 1) {
    weighted01 *= SINGLE_FIELD_MISSING_PENALTY;
  }
  if (flags.includes("extreme_mismatch")) {
    weighted01 *= EXTREME_MISMATCH_PENALTY;
  }

  let skills_alignment: number | undefined;
  let matched_skills_count: number | undefined;
  let required_skills_count: number | undefined;
  if (reqSkillN > 0) {
    skills_alignment = clamp01(matSkillN / reqSkillN);
    matched_skills_count = matSkillN;
    required_skills_count = reqSkillN;
    weighted01 *=
      AT_V1_SKILL_ALIGN_FLOOR + (1 - AT_V1_SKILL_ALIGN_FLOOR) * skills_alignment;
  }

  const score_0_100 = Math.max(0, Math.min(100, weighted01 * 100));

  return {
    experience,
    notice,
    education,
    seniority,
    score_0_100,
    partial_data,
    flags,
    skills_alignment,
    matched_skills_count,
    required_skills_count,
  };
}

/** Merged candidate ATS fields (e.g. from `CandidateRankingSignals.ats`) — single entry point for V1. */
export type MergedAtsCandidateSignals = {
  experience_years: number | null;
  notice_period_days: number | null;
  education_raw: string | null;
};

export function computeAtsV1ScoreFromSignals(
  ats: MergedAtsCandidateSignals,
  job: {
    requiredExperienceYears: number | null;
    jobSkillLevel: string | null;
    jobEducationRequirement: string | null;
  },
  structuredSkillMatch?: { requiredCount: number; matchedCount: number } | null,
): AtsV1Breakdown {
  return computeAtsV1Score({
    candidateExperienceYears: ats.experience_years,
    requiredExperienceYears: job.requiredExperienceYears,
    noticePeriodDays: ats.notice_period_days,
    jobSkillLevel: job.jobSkillLevel,
    jobEducationRequirement: job.jobEducationRequirement,
    candidateEducationRaw: ats.education_raw,
    structuredSkillMatch: structuredSkillMatch ?? undefined,
  });
}

export type AtsRankingEngineMode = "hybrid" | "ats_v1" | "phase5_only";

export function resolveAtsRankingEngineMode(): AtsRankingEngineMode {
  // Deterministic submode resolver only. Overall ranking engine is resolved elsewhere.
  const raw = (process.env.RANKING_ENGINE ?? "ai_only").trim().toLowerCase();
  if (raw === "ats_v1" || raw === "v1") return "ats_v1";
  if (raw === "phase5_only" || raw === "phase5") return "phase5_only";
  // For ai_only / hybrid / deterministic (and any unknowns), deterministic fallback uses hybrid.
  return "hybrid";
}

/** Weight of ATS V1 in hybrid mode (0–1). Remainder is Phase 5 composite. */
export function resolveAtsV1HybridWeight(): number {
  const raw = process.env.RANKING_ATS_V1_WEIGHT?.trim();
  if (!raw) return 0.35;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.35;
  if (n > 1) return Math.min(1, n / 100);
  return Math.max(0, Math.min(1, n));
}
