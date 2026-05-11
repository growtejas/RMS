/**
 * Interview lifecycle funnel computation.
 *
 * Returns the stages + bottlenecks payload. The service layer is
 * responsible for wrapping with freshness metadata before returning to
 * the API.
 */

import { indexBy } from "@/lib/analytics/aggregations/group";
import { diffHours } from "@/lib/analytics/utils/dates";
import { average, pct, roundTo } from "@/lib/analytics/utils/math";
import type {
  ReportInterviewRow,
  ReportScorecardRow,
} from "@/lib/repositories/reports-repo";
import type { InterviewFunnelStage } from "@/lib/reports/types";

const FEEDBACK_SLA_HOURS = 48;

const INTERVIEW_STAGE_ORDER: Array<{ key: string; label: string }> = [
  { key: "scheduled", label: "Scheduled" },
  { key: "attended", label: "Attended" },
  { key: "feedback_submitted", label: "Feedback Submitted" },
  { key: "passed", label: "Passed" },
  { key: "rejected", label: "Rejected" },
  { key: "offer_recommended", label: "Offer Recommended" },
];

function deriveStageKey(status: string | null, result: string | null): string {
  const statusLc = (status ?? "").toLowerCase();
  const resultUc = (result ?? "").toUpperCase();
  if (resultUc === "PASS") return "passed";
  if (resultUc === "FAIL" || statusLc.includes("reject")) return "rejected";
  if (resultUc === "OFFER" || statusLc.includes("offer")) return "offer_recommended";
  if (statusLc.includes("complet") || statusLc.includes("done")) return "attended";
  if (statusLc.includes("feedback")) return "feedback_submitted";
  return "scheduled";
}

export interface InterviewFunnelComputation {
  stages: InterviewFunnelStage[];
  bottlenecks: Array<{ stage: string; delayedCount: number; warning: string }>;
}

export function computeInterviewFunnel(
  interviews: ReportInterviewRow[],
  scorecards: ReportScorecardRow[],
): InterviewFunnelComputation {
  const scorecardByInterview = indexBy(scorecards, (s) => s.interviewId);
  const stageInputs = new Map<
    string,
    { count: number; passes: number; noShows: number; turnaroundHours: number[] }
  >();
  const ensure = (key: string) => {
    let inputs = stageInputs.get(key);
    if (!inputs) {
      inputs = { count: 0, passes: 0, noShows: 0, turnaroundHours: [] };
      stageInputs.set(key, inputs);
    }
    return inputs;
  };

  for (const iv of interviews) {
    const key = deriveStageKey(iv.status ?? null, iv.result ?? null);
    const inputs = ensure(key);
    inputs.count += 1;
    if ((iv.result ?? "").toUpperCase() === "PASS") inputs.passes += 1;
    if ((iv.status ?? "").toUpperCase() === "NO_SHOW") inputs.noShows += 1;
    const card = scorecardByInterview.get(iv.interviewId);
    if (card?.submittedAt) {
      inputs.turnaroundHours.push(diffHours(card.submittedAt, iv.scheduledAt));
    }
  }

  const totalInterviews = interviews.length;
  const stages: InterviewFunnelStage[] = INTERVIEW_STAGE_ORDER.map(({ key, label }) => {
    const inputs = stageInputs.get(key) ?? { count: 0, passes: 0, noShows: 0, turnaroundHours: [] };
    return {
      key,
      stage: label,
      count: inputs.count,
      passRatePct: pct(inputs.passes, inputs.count),
      completionRatioPct: pct(inputs.count, totalInterviews),
      noShowPct: pct(inputs.noShows, inputs.count),
      avgFeedbackTurnaroundHours: average(inputs.turnaroundHours),
    };
  });

  const bottlenecks = stages
    .filter((s) => s.avgFeedbackTurnaroundHours > FEEDBACK_SLA_HOURS && s.count > 0)
    .map((s) => {
      const stageInput = stageInputs.get(s.key);
      const breached = stageInput
        ? stageInput.turnaroundHours.filter((h) => h > FEEDBACK_SLA_HOURS).length
        : 0;
      return {
        stage: s.stage,
        delayedCount: breached,
        warning: `Feedback turnaround exceeds ${FEEDBACK_SLA_HOURS}h SLA (avg ${roundTo(s.avgFeedbackTurnaroundHours, 1)}h)`,
      };
    });

  return { stages, bottlenecks };
}
