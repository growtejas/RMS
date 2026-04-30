import { z } from "zod";

/** Panelist / interviewer feedback (stored in scorecards.scores + notes). */
export const interviewerFeedbackPostBody = z.object({
  recommendation: z.enum(["strong_yes", "yes", "neutral", "no", "strong_no"]),
  strengths: z.string().max(5000).optional().nullable(),
  weaknesses: z.string().max(5000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const interviewScorecardPostBody = z.object({
  panelist_id: z.number().int().positive().optional().nullable(),
  scores: z
    .object({
      overall_rating: z.coerce.number().int().min(1).max(5).optional(),
      recommendation: z
        .enum(["strong_yes", "yes", "neutral", "no", "strong_no"])
        .optional(),
    })
    .passthrough(),
  notes: z.string().max(5000).optional().nullable(),
});

export function aggregateScorecardRatings(
  scoreRows: { scores: unknown }[],
): { count: number; average_overall: number | null } {
  const ratings: number[] = [];
  for (const r of scoreRows) {
    const s = r.scores;
    if (s && typeof s === "object" && "overall_rating" in s) {
      const n = Number((s as { overall_rating: unknown }).overall_rating);
      if (Number.isFinite(n) && n >= 1 && n <= 5) {
        ratings.push(n);
      }
    }
  }
  if (ratings.length === 0) {
    return { count: 0, average_overall: null };
  }
  const sum = ratings.reduce((a, b) => a + b, 0);
  return { count: ratings.length, average_overall: sum / ratings.length };
}
