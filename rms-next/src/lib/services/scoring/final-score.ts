import type { DeterministicEngineMode, RankingEngineMode } from "@/lib/services/scoring/ranking-engine";

export type AiStatus = "ok" | "cached" | "unavailable" | "failed";

export type FinalScoreGuardrailsConfig = {
  /** When true, apply caps based on structured required skills match. */
  capWhenNoRequiredSkillsMatch: boolean;
  /** Cap value (0–100) applied when no required skill matches. */
  noRequiredSkillsMatchCap: number;
  /** When true, apply caps based on experience gap. */
  capWhenExperienceFarBelow: boolean;
  /** Required gap in years to trigger cap (e.g. 3 means cand <= req-3). */
  experienceFarBelowGapYears: number;
  /** Cap value (0–100) applied when far below. */
  experienceFarBelowCap: number;
  /** When true, flag low confidence. */
  flagLowAiConfidence: boolean;
  /** Threshold (0–1) below which to flag. */
  lowAiConfidenceThreshold: number;
  /** Factor applied to ai_score when low-confidence (0–1). */
  lowAiConfidencePenaltyFactor: number;
};

export type ComputeFinalScoreInput = {
  engine: RankingEngineMode;
  deterministicSubmode: DeterministicEngineMode;
  deterministicFinalScore: number;
  aiScore: number | null;
  aiConfidence: number | null;
  /** AI-evaluated JD alignment score (0–100), when available. */
  jdAlignmentScore?: number | null;
  /** True when AI cache row matched current input_hash. */
  aiCacheHit: boolean;
  /** True when AI run was attempted but failed (for POST flows). */
  aiFailed?: boolean;

  // Guardrail inputs
  requiredSkillsCount: number;
  matchedRequiredSkillsCount: number;
  requiredExperienceYears: number | null;
  candidateExperienceYears: number | null;

  guardrails?: Partial<FinalScoreGuardrailsConfig>;
};

export type ComputeFinalScoreOutput = {
  finalScore: number | null;
  scoringEngineUsed: RankingEngineMode | `deterministic:${DeterministicEngineMode}`;
  aiStatus: AiStatus;
  explainFlags: string[];
  deterministicFallbackUsed: boolean;
  capsApplied: Array<{ reason: string; cap: number }>;
};

const DEFAULT_GUARDRAILS: FinalScoreGuardrailsConfig = {
  capWhenNoRequiredSkillsMatch: true,
  noRequiredSkillsMatchCap: 55,
  capWhenExperienceFarBelow: true,
  experienceFarBelowGapYears: 3,
  experienceFarBelowCap: 60,
  flagLowAiConfidence: true,
  lowAiConfidenceThreshold: 0.6,
  lowAiConfidencePenaltyFactor: 0.9,
};

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function resolveEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveJdMultiplierBase(): number {
  return clamp01(resolveEnvNumber("RANKING_JD_MULTIPLIER_BASE", 0.55));
}

function resolveJdMultiplierRange(): number {
  return clamp01(resolveEnvNumber("RANKING_JD_MULTIPLIER_RANGE", 0.45));
}

function resolveSkillCapLowRatio(): number {
  return clamp01(resolveEnvNumber("RANKING_SKILL_CAP_LOW_RATIO", 0.3));
}

function resolveSkillCapLowScore(): number {
  return clampScore(resolveEnvNumber("RANKING_SKILL_CAP_LOW_SCORE", 45));
}

function resolveSkillCapMidRatio(): number {
  return clamp01(resolveEnvNumber("RANKING_SKILL_CAP_MID_RATIO", 0.5));
}

function resolveSkillCapMidScore(): number {
  return clampScore(resolveEnvNumber("RANKING_SKILL_CAP_MID_SCORE", 60));
}

/**
 * JD strictness softening factor (0..1) derived from required experience years.
 *
 * Product intent:
 * - Fresher roles should be reasonably soft.
 * - Softness should increase as JD required experience increases.
 */
function resolveExperienceSoftness(requiredExperienceYears: number | null): number {
  const req = Number(requiredExperienceYears);
  if (!Number.isFinite(req) || req <= 0) return 0.2;
  return clamp01(0.2 + 0.6 * Math.min(req, 10) / 10);
}

function mergeGuardrails(
  overrides?: Partial<FinalScoreGuardrailsConfig>,
): FinalScoreGuardrailsConfig {
  return { ...DEFAULT_GUARDRAILS, ...(overrides ?? {}) };
}

function applyCaps(params: {
  score: number;
  requiredSkillsCount: number;
  matchedRequiredSkillsCount: number;
  requiredExperienceYears: number | null;
  candidateExperienceYears: number | null;
  jdAlignmentScore: number | null;
  guardrails: FinalScoreGuardrailsConfig;
}): { score: number; capsApplied: Array<{ reason: string; cap: number }>; flags: string[] } {
  let out = params.score;
  const capsApplied: Array<{ reason: string; cap: number }> = [];
  const flags: string[] = [];
  const softness = resolveExperienceSoftness(params.requiredExperienceYears);

  // Option 2: apply a JD-driven multiplier before caps.
  if (params.jdAlignmentScore != null && Number.isFinite(params.jdAlignmentScore)) {
    const jd01 = clamp01(params.jdAlignmentScore / 100);
    const base = resolveJdMultiplierBase();
    const range = resolveJdMultiplierRange();
    const multiplier = clamp01(base + range * jd01);
    out = clampScore(out * multiplier);
    flags.push(`jd_multiplier:${multiplier.toFixed(3)}`);
  }

  // Option 3: enforce explicit required-skills ratio-based caps.
  if (params.requiredSkillsCount > 0 && params.matchedRequiredSkillsCount >= 0) {
    const ratio = clamp01(params.matchedRequiredSkillsCount / params.requiredSkillsCount);
    const lowRatio = resolveSkillCapLowRatio();
    const midRatio = Math.max(lowRatio, resolveSkillCapMidRatio());
    const lowCap = resolveSkillCapLowScore();
    const midCap = resolveSkillCapMidScore();
    if (ratio < lowRatio && out > lowCap) {
      out = lowCap;
      capsApplied.push({ reason: "required_skills_ratio_low", cap: lowCap });
      flags.push(`cap:required_skills_ratio_low(${(ratio * 100).toFixed(0)}%)`);
    } else if (ratio < midRatio && out > midCap) {
      out = midCap;
      capsApplied.push({ reason: "required_skills_ratio_mid", cap: midCap });
      flags.push(`cap:required_skills_ratio_mid(${(ratio * 100).toFixed(0)}%)`);
    }
  }

  if (params.guardrails.capWhenNoRequiredSkillsMatch) {
    const hasReq = params.requiredSkillsCount > 0;
    const matched = params.matchedRequiredSkillsCount;
    if (hasReq && matched <= 0) {
      // Higher JD experience => more tolerant cap for missing structured skill match.
      const cap = clampScore(params.guardrails.noRequiredSkillsMatchCap + 25 * softness);
      if (out > cap) {
        out = cap;
        capsApplied.push({ reason: "no_required_skill_match", cap });
      }
      flags.push("cap:no_required_skill_match");
    }
  }

  if (params.guardrails.capWhenExperienceFarBelow) {
    const req = params.requiredExperienceYears;
    const cand = params.candidateExperienceYears;
    if (
      req != null &&
      Number.isFinite(req) &&
      req > 0 &&
      cand != null &&
      Number.isFinite(cand)
    ) {
      const gap = req - cand;
      const dynamicGapThreshold = params.guardrails.experienceFarBelowGapYears + Math.round(2 * softness);
      if (gap >= dynamicGapThreshold) {
        // Higher JD experience => less harsh cap (still bounded by guardrails).
        const cap = clampScore(params.guardrails.experienceFarBelowCap + 18 * softness);
        if (out > cap) {
          out = cap;
          capsApplied.push({ reason: "experience_far_below", cap });
        }
        flags.push("cap:experience_far_below");
      }
    }
  }

  flags.push(`softness:${softness.toFixed(2)}`);
  return { score: out, capsApplied, flags };
}

export function computeFinalScore(input: ComputeFinalScoreInput): ComputeFinalScoreOutput {
  const guardrails = mergeGuardrails(input.guardrails);
  const explainFlags: string[] = [];
  const capsApplied: Array<{ reason: string; cap: number }> = [];

  const aiOk = input.aiScore != null && Number.isFinite(input.aiScore);
  const aiConfOk = input.aiConfidence != null && Number.isFinite(input.aiConfidence);
  const aiStatus: AiStatus = input.aiFailed
    ? "failed"
    : input.aiCacheHit
      ? "cached"
      : aiOk
        ? "ok"
        : "unavailable";

  if (
    guardrails.flagLowAiConfidence &&
    aiOk &&
    aiConfOk &&
    Number(input.aiConfidence) < guardrails.lowAiConfidenceThreshold
  ) {
    explainFlags.push("LOW_CONFIDENCE");
  }

  const deterministicFinal = clampScore(input.deterministicFinalScore);

  // Choose base final score by engine mode.
  let final: number | null;
  let scoringEngineUsed: ComputeFinalScoreOutput["scoringEngineUsed"] = input.engine;
  let deterministicFallbackUsed = false;

  if (input.engine === "deterministic") {
    final = deterministicFinal;
    scoringEngineUsed = `deterministic:${input.deterministicSubmode}`;
  } else if (input.engine === "ai_only") {
    if (aiOk) {
      const base = clampScore(Number(input.aiScore));
      const lowConf =
        guardrails.flagLowAiConfidence &&
        aiConfOk &&
        Number(input.aiConfidence) < guardrails.lowAiConfidenceThreshold;
      const softness = resolveExperienceSoftness(input.requiredExperienceYears);
      const lowConfidencePenaltyFactor = Math.min(
        1,
        guardrails.lowAiConfidencePenaltyFactor + 0.08 * softness,
      );
      final = lowConf
        ? clampScore(base * lowConfidencePenaltyFactor)
        : base;
    } else {
      final = null;
      explainFlags.push("ai:unavailable_no_score");
    }
  } else {
    // engine === "hybrid" (AI + deterministic)
    if (!aiOk) {
      final = deterministicFinal;
      deterministicFallbackUsed = true;
      explainFlags.push("ai:unavailable_fallback_to_deterministic");
      scoringEngineUsed = `deterministic:${input.deterministicSubmode}`;
    } else {
      // Fixed default blend; keep it simple and predictable for now.
      // (Confidence-based weighting remains available at the AI evaluation layer; this is engine-level policy.)
      const w = 0.3;
      final = clampScore((1 - w) * deterministicFinal + w * Number(input.aiScore));
      explainFlags.push("ai:hybrid_blend");
    }
  }

  // Apply guardrail caps on top of base score.
  if (final != null) {
    const capped = applyCaps({
      score: final,
      requiredSkillsCount: input.requiredSkillsCount,
      matchedRequiredSkillsCount: input.matchedRequiredSkillsCount,
      requiredExperienceYears: input.requiredExperienceYears,
      candidateExperienceYears: input.candidateExperienceYears,
      jdAlignmentScore:
        input.jdAlignmentScore != null && Number.isFinite(input.jdAlignmentScore)
          ? Number(input.jdAlignmentScore)
          : null,
      guardrails,
    });
    final = capped.score;
    capsApplied.push(...capped.capsApplied);
    explainFlags.push(...capped.flags);
  }

  return {
    finalScore: final,
    scoringEngineUsed,
    aiStatus,
    explainFlags,
    deterministicFallbackUsed,
    capsApplied,
  };
}

