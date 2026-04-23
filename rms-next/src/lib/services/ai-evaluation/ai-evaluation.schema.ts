import { z } from "zod";

/** Spec §6 — LLM output (strict). */
export const aiEvaluationOutputSchema = z.object({
  project_complexity: z.number().min(0).max(100),
  growth_trajectory: z.number().min(0).max(100),
  company_reputation: z.number().min(0).max(100),
  jd_alignment: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(10).max(4000),
  risks: z.array(z.string().max(500)).max(30),
});

export type AiEvaluationOutput = z.infer<typeof aiEvaluationOutputSchema>;

/** Spec §3.1 — normalized job payload for AI (no raw blobs). */
export const jobEvaluationInputSchema = z.object({
  title: z.string().max(300),
  required_skills: z.array(z.string().max(120)).max(80),
  required_experience: z.number().min(0).max(80),
  description_summary: z.string().max(12000),
});

export type JobEvaluationInput = z.infer<typeof jobEvaluationInputSchema>;

/** Spec §3.2 — normalized candidate payload. */
export const candidateEvaluationInputSchema = z.object({
  skills: z.array(z.string().max(120)).max(80),
  experience_years: z.number().min(0).max(80).nullable(),
  projects: z.array(z.string().max(600)).max(40),
  experience_details: z.array(z.string().max(500)).max(60),
  job_title: z.string().max(200).nullable(),
  companies: z.array(z.string().max(200)).max(40),
});

export type CandidateEvaluationInput = z.infer<typeof candidateEvaluationInputSchema>;

const W_PROJECT = 0.3;
const W_GROWTH = 0.25;
const W_JD = 0.3;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Softness factor used to reduce JD strictness as required experience grows.
 * 0 => default weighting, 1 => maximum softening.
 */
export function resolveExperienceSoftness(requiredExperienceYears: number | null | undefined): number {
  const req = Number(requiredExperienceYears);
  if (!Number.isFinite(req) || req <= 0) return 0.2;
  return clamp01(0.2 + 0.6 * Math.min(req, 10) / 10);
}

function resolveAiDimensionWeights(requiredExperienceYears: number | null | undefined): {
  project: number;
  growth: number;
  company: number;
  jd: number;
} {
  const softness = resolveExperienceSoftness(requiredExperienceYears);
  // Keep all dimensions active, but progressively soften strict JD alignment
  // and reward potential signals (projects + growth) more.
  const project = W_PROJECT + 0.08 * softness;
  const growth = W_GROWTH + 0.06 * softness;
  const jd = Math.max(0.15, W_JD - 0.12 * softness);
  const company = Math.max(0.1, 1 - project - growth - jd);
  // Normalize to avoid rounding drift.
  const sum = project + growth + jd + company;
  return {
    project: project / sum,
    growth: growth / sum,
    company: company / sum,
    jd: jd / sum,
  };
}

/** Spec §7 — composite 0–100 from validated dimensions. */
export function computeAiCompositeScore(b: {
  project_complexity: number;
  growth_trajectory: number;
  company_reputation: number;
  jd_alignment: number;
}, requiredExperienceYears?: number | null): number {
  const w = resolveAiDimensionWeights(requiredExperienceYears);
  const raw =
    w.project * b.project_complexity +
    w.growth * b.growth_trajectory +
    w.company * b.company_reputation +
    w.jd * b.jd_alignment;
  return Math.max(0, Math.min(100, Number(raw.toFixed(2))));
}

/** Spec §8.1 — blend weight of AI vs deterministic. */
export function resolveAiBlendWeight(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  if (confidence >= 0.5) return 0.3;
  return 0.1;
}

export function blendDeterministicWithAi(
  deterministicFinal: number,
  aiScore: number,
  confidence: number,
): number {
  const w = resolveAiBlendWeight(confidence);
  if (w <= 0) return deterministicFinal;
  const out = (1 - w) * deterministicFinal + w * aiScore;
  return Math.max(0, Math.min(100, Number(out.toFixed(2))));
}
