import type {
  AiStrengthLabel,
  Band,
  CandidateEvaluationCardModel,
  FitLabel,
} from "@/components/evaluation/candidate-evaluation-card.types";

/** Minimal ranking row shape from GET /ranking/requisition-items/:id (optional AI enrich). */
export type RankingRowForEvaluationCard = {
  candidate_id: number;
  full_name: string;
  score: {
    final_score: number | null;
    ai_status?: "OK" | "PENDING" | "UNAVAILABLE";
    ai_confidence?: number;
    ai_summary?: string;
    ai_risks?: string[];
    deterministic_final_score?: number;
  };
  meta?: { skill_match_ratio?: number };
  explain: {
    matched_skills?: string[];
    missing_skills?: string[];
    ai_score?: number;
    ai_summary?: string;
    ai_risks?: string[];
    ai_confidence?: number;
    ranking_signals?: {
      ats?: { experience_years?: number | null };
    };
  };
};

export type EvaluationCardContext = {
  requiredExperienceYears: number | null;
  requiredSkillsCount?: number;
};

const SKILL_HIGH = 0.67;
const SKILL_MED = 0.34;
const EXP_NEAR_GAP = 1;

export function bandToUserLabel(b: Band): "High" | "Medium" | "Low" {
  if (b === "high") return "High";
  if (b === "medium") return "Medium";
  return "Low";
}

function fitLabelFromFinal(score: number): FitLabel {
  if (score >= 80) return "Strong Fit";
  if (score >= 60) return "Good Fit";
  if (score >= 40) return "Moderate Fit";
  return "Low Fit";
}

/** List + modal headline use deterministic score; enriched GET may also set a blended `final_score`. */
function resolveListAlignedAndBlendedRank(
  row: RankingRowForEvaluationCard,
): { listAligned: number; aiBlendedRankRounded: number | null } {
  const final = row.score.final_score;
  const det = row.score.deterministic_final_score;
  if (det != null && Number.isFinite(det)) {
    const blendedRounded =
      final != null &&
      Number.isFinite(final) &&
      Math.round(final) !== Math.round(det)
        ? Math.round(final)
        : null;
    return { listAligned: det, aiBlendedRankRounded: blendedRounded };
  }
  if (final != null && Number.isFinite(final)) {
    return { listAligned: final, aiBlendedRankRounded: null };
  }
  return { listAligned: 0, aiBlendedRankRounded: null };
}

function aiStrengthFromScore(score: number): AiStrengthLabel {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Good";
  if (score >= 40) return "Moderate";
  return "Weak";
}

function resolveSkillsBand(
  row: RankingRowForEvaluationCard,
  ctx: EvaluationCardContext,
): Band {
  const ratio = row.meta?.skill_match_ratio;
  if (ratio != null && Number.isFinite(ratio)) {
    if (ratio >= SKILL_HIGH) return "high";
    if (ratio >= SKILL_MED) return "medium";
    return "low";
  }
  const matched = row.explain.matched_skills?.length ?? 0;
  const req = ctx.requiredSkillsCount;
  if (req != null && req > 0) {
    const r = matched / req;
    if (r >= SKILL_HIGH) return "high";
    if (r >= SKILL_MED) return "medium";
    return "low";
  }
  if (matched >= 4) return "high";
  if (matched >= 2) return "medium";
  return "low";
}

function resolveExperienceBand(
  row: RankingRowForEvaluationCard,
  ctx: EvaluationCardContext,
): Band {
  const req = ctx.requiredExperienceYears;
  const cand =
    row.explain.ranking_signals?.ats?.experience_years ?? null;
  if (req == null || !Number.isFinite(req) || req <= 0) {
    if (cand != null && cand > 0) return "high";
    return "medium";
  }
  if (cand == null || !Number.isFinite(cand)) return "low";
  if (cand >= req) return "high";
  if (cand >= req - EXP_NEAR_GAP) return "medium";
  return "low";
}

function formatMatchedSkillsLine(skills: string[]): string | null {
  const s = skills.filter(Boolean).slice(0, 3);
  if (s.length === 0) return null;
  const joined = s.join(", ");
  return `Strong match on ${joined}`;
}

function experienceHighlightLine(expBand: Band): string | null {
  if (expBand === "high") return "Meets the experience expectation for this role";
  if (expBand === "medium") return "Experience is close to what this role asks for";
  return "Experience may be below what this role asks for";
}

function splitSummaryLines(raw: string | undefined, maxLines: number): string[] {
  if (!raw?.trim()) return [];
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const parts = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    let line = p.trim();
    if (/^(may|could potentially|might)\s/i.test(line)) continue;
    out.push(line);
    if (out.length >= maxLines) break;
  }
  return out.slice(0, maxLines);
}

function dedupeStrings(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of items) {
    const k = t.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t.trim());
    if (out.length >= max) break;
  }
  return out;
}

function buildRankingWhy(
  skillsBand: Band,
  expBand: Band,
  aiConfidence: number | undefined,
): string[] {
  const out: string[] = [];
  if (skillsBand === "high") {
    out.push("Required skills are well covered for this role.");
  } else if (skillsBand === "medium") {
    out.push("Several required skills match; some gaps remain.");
  } else {
    out.push("Skill coverage is limited compared with what this role needs.");
  }
  if (expBand === "high" && skillsBand !== "low") {
    out.push("Overall profile aligns well with this role.");
  } else if (expBand !== "high") {
    out.push("Experience level is an important factor for this ranking.");
  }
  if (aiConfidence != null && Number.isFinite(aiConfidence)) {
    if (aiConfidence >= 0.7) {
      out.push("High confidence in the AI assessment for this profile.");
    } else if (aiConfidence >= 0.5) {
      out.push("Moderate confidence in the AI assessment for this profile.");
    } else {
      out.push("Lower confidence in the AI assessment—use it as one input only.");
    }
  }
  return out.slice(0, 3);
}

export function mapRankedCandidateToEvaluationCard(
  row: RankingRowForEvaluationCard,
  ctx: EvaluationCardContext,
): CandidateEvaluationCardModel {
  const { listAligned, aiBlendedRankRounded } = resolveListAlignedAndBlendedRank(row);
  const finalScoreRounded = Math.round(listAligned);
  const fitLabel = fitLabelFromFinal(finalScoreRounded);
  const skillsFit = resolveSkillsBand(row, ctx);
  const experienceFit = resolveExperienceBand(row, ctx);

  const highlights: CandidateEvaluationCardModel["highlights"] = [];
  const matched = row.explain.matched_skills ?? [];
  const miss = row.explain.missing_skills ?? [];

  const skillLine = formatMatchedSkillsLine(matched);
  if (skillLine) highlights.push({ tone: "positive", text: skillLine });

  const expLine = experienceHighlightLine(experienceFit);
  if (expLine) {
    const tone = experienceFit === "low" ? "warning" : "positive";
    highlights.push({ tone, text: expLine });
  }

  const summaryFromRow =
    (typeof row.score.ai_summary === "string" && row.score.ai_summary.trim()
      ? row.score.ai_summary.trim()
      : null) ??
    (typeof row.explain.ai_summary === "string" && row.explain.ai_summary.trim()
      ? row.explain.ai_summary.trim()
      : null);

  if (summaryFromRow) {
    const first = splitSummaryLines(summaryFromRow, 1)[0];
    if (first && highlights.length < 4) {
      const dup = highlights.some(
        (h) => h.text.toLowerCase() === first.toLowerCase(),
      );
      if (!dup) highlights.push({ tone: "positive", text: first });
    }
  }

  if (highlights.length < 4 && miss.length > 0) {
    highlights.push({
      tone: "warning",
      text: `Gap called out: ${miss[0]}`,
    });
  }

  while (highlights.length > 4) highlights.pop();

  const aiStatus = row.score.ai_status;
  const aiOk =
    aiStatus === "OK" &&
    row.score.final_score != null &&
    Number.isFinite(row.score.final_score);

  const aiScore =
    aiOk
      ? Number(row.score.final_score)
      : row.explain.ai_score != null && Number.isFinite(row.explain.ai_score)
        ? Number(row.explain.ai_score)
        : null;
  const hasAi = aiScore != null;

  const summaryFullRaw = summaryFromRow;
  let summaryLines = hasAi
    ? splitSummaryLines(summaryFullRaw ?? undefined, 3)
    : [];
  if (hasAi && summaryLines.length === 0) {
    summaryLines = ["No written summary is stored for this evaluation."];
  }

  const risksFromRow =
    row.score.ai_risks && Array.isArray(row.score.ai_risks)
      ? row.score.ai_risks
      : row.explain.ai_risks ?? [];
  const risksRaw = [...miss.slice(0, 2), ...risksFromRow.slice(0, 2)];
  const risks = dedupeStrings(risksRaw, 3);

  const rankingWhy = buildRankingWhy(
    skillsFit,
    experienceFit,
    row.score.ai_confidence ?? row.explain.ai_confidence,
  );

  const positiveTexts = highlights
    .filter((h) => h.tone === "positive")
    .map((h) => h.text);
  const shortlistReasons = positiveTexts.slice(0, 3);
  const firstRisk = risks[0];

  return {
    candidateId: row.candidate_id,
    fullName: row.full_name,
    finalScoreRounded,
    ...(aiBlendedRankRounded != null
      ? { aiBlendedRankScoreRounded: aiBlendedRankRounded }
      : {}),
    fitLabel,
    highlights,
    skillsFit,
    experienceFit,
    ai: {
      score: aiScore,
      strengthLabel: hasAi ? aiStrengthFromScore(aiScore!) : null,
      summaryLines: hasAi
        ? summaryLines
        : ["AI evaluation not available yet for this candidate."],
      ...(hasAi && summaryFullRaw ? { summaryFull: summaryFullRaw } : {}),
      unavailableMessage: hasAi ? undefined : "AI evaluation not available yet.",
    },
    risks,
    rankingWhy,
    shortlistPreview: {
      reasons:
        shortlistReasons.length > 0
          ? shortlistReasons
          : ["Profile reviewed against this role."],
      ...(firstRisk ? { risk: firstRisk } : {}),
    },
  };
}
