/**
 * Interviewer performance computation.
 *
 * Replaces the Phase 1 service that synthesized `avgCandidateRating` via
 * `Math.random()`. Now derives the rating from scorecard `scores` JSON
 * payloads when available, falling back to 0 when no rating data exists
 * (UI may render this as "n/a").
 */

import { groupBy } from "@/lib/analytics/aggregations/group";
import { diffHours } from "@/lib/analytics/utils/dates";
import { average, pct, safeNumber } from "@/lib/analytics/utils/math";
import type {
  ReportInterviewRow,
  ReportScorecardRow,
} from "@/lib/repositories/reports-repo";
import type { InterviewerPerformanceRow } from "@/lib/reports/types";

const FEEDBACK_OVERDUE_HOURS = 48;

function extractRatingFromScorecard(scores: unknown): number | null {
  if (!scores || typeof scores !== "object") return null;
  const obj = scores as Record<string, unknown>;
  const candidates = [
    obj.overall,
    obj.overall_rating,
    obj.overallRating,
    obj.rating,
    obj.score,
  ];
  for (const value of candidates) {
    const n = safeNumber(value, Number.NaN);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (Array.isArray(obj.criteria)) {
    const ratings = obj.criteria
      .map((c: unknown) => safeNumber((c as { rating?: unknown })?.rating, Number.NaN))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (ratings.length > 0) return ratings.reduce((s, v) => s + v, 0) / ratings.length;
  }
  return null;
}

export function computeInterviewerPerformance(
  interviews: ReportInterviewRow[],
  scorecards: ReportScorecardRow[],
): InterviewerPerformanceRow[] {
  const scorecardsByInterview = new Map<number, ReportScorecardRow>();
  for (const sc of scorecards) scorecardsByInterview.set(sc.interviewId, sc);

  const grouped = groupBy(interviews, (iv) => iv.conductedBy ?? -1);
  const rows: InterviewerPerformanceRow[] = [];
  grouped.forEach((ivs, interviewerKey) => {
    const passes = ivs.filter((v) => (v.result ?? "").toUpperCase() === "PASS").length;
    const turnaround: number[] = [];
    const ratings: number[] = [];
    for (const iv of ivs) {
      const sc = scorecardsByInterview.get(iv.interviewId);
      if (sc?.submittedAt) turnaround.push(diffHours(sc.submittedAt, iv.scheduledAt));
      const rating = extractRatingFromScorecard(sc?.scores);
      if (rating != null) ratings.push(rating);
    }
    const overdue = turnaround.filter((v) => v > FEEDBACK_OVERDUE_HOURS).length;
    rows.push({
      interviewerId: interviewerKey === -1 ? null : interviewerKey,
      interviewer: ivs[0]?.interviewer ?? "Deleted interviewer",
      interviewsConducted: ivs.length,
      passRatioPct: pct(passes, ivs.length),
      avgCandidateRating: ratings.length > 0 ? average(ratings) : 0,
      avgFeedbackSubmissionHours: average(turnaround),
      overdueFeedbackCount: overdue,
    });
  });
  rows.sort((a, b) => b.interviewsConducted - a.interviewsConducted);
  return rows;
}
