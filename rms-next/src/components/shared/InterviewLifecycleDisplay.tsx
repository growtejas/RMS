"use client";

/**
 * Shared presentation for interview lifecycle (stages + rounds).
 * Used by the full `InterviewLifecycle` profile panel and read-only strips
 * (e.g. TA requisition candidates workspace cards).
 */

import React, { useMemo, useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";

import type {
  LifecycleColor,
  LifecyclePayload,
  LifecycleResult,
  LifecycleRound,
  LifecycleStage,
  LifecycleStageState,
} from "@/lib/api/candidateApi";

export const COLOR_CLASSES: Record<LifecycleColor, string> = {
  grey: "bg-slate-100 text-slate-600 ring-slate-200",
  blue: "bg-blue-100 text-blue-800 ring-blue-300",
  yellow: "bg-amber-100 text-amber-900 ring-amber-300",
  green: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  red: "bg-red-100 text-red-800 ring-red-300",
  orange: "bg-orange-100 text-orange-900 ring-orange-300",
};

export const ARROW_CLASS = "text-slate-400 shrink-0";

export function formatLifecycleDateTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

export function stageStateLabel(state: LifecycleStageState): string {
  switch (state) {
    case "past":
      return "Completed";
    case "current":
      return "In progress";
    case "rejected":
      return "Rejected";
    case "not_started":
    default:
      return "Not started";
  }
}

function roundResultLabel(result: LifecycleResult): string {
  switch (result) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "hold":
      return "On hold";
    case "pending":
    default:
      return "Result pending";
  }
}

export function roundStatusLabel(round: LifecycleRound): string {
  if (round.status === "completed") {
    return roundResultLabel(round.result);
  }
  if (round.status === "scheduled") return "Scheduled";
  if (round.status === "no_show") return "No show";
  if (round.status === "rescheduled") return "Rescheduled";
  return "Cancelled";
}

export function StageBox({
  stage,
  compact,
}: {
  stage: LifecycleStage;
  compact?: boolean;
}) {
  const cls = COLOR_CLASSES[stage.color];
  const min = compact ? "min-w-[92px]" : "min-w-[140px]";
  return (
    <div
      className={`${min} rounded-xl px-2.5 py-2 text-xs font-semibold ring-1 ${cls}`}
      title={`${stage.label} · ${stageStateLabel(stage.state)}`}
    >
      <div className="text-[10px] uppercase tracking-wide opacity-70">
        {stageStateLabel(stage.state)}
      </div>
      <div className={`font-bold ${compact ? "text-[11px] leading-tight" : "text-sm"}`}>
        {stage.label}
      </div>
    </div>
  );
}

interface RoundBoxProps {
  round: LifecycleRound;
  isLatest: boolean;
  canWrite: boolean;
  isBusy: boolean;
  href: string;
  /** Profile panel uses wider round cards. */
  wide?: boolean;
  readOnly?: boolean;
  onSubmitResult: (
    interviewId: number,
    result: Exclude<LifecycleResult, "pending">,
  ) => void;
}

function SubmitResultMenu({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (r: Exclude<LifecycleResult, "pending">) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        Submit Result
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(false);
          onPick("passed");
        }}
        className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
      >
        Pass
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(false);
          onPick("failed");
        }}
        className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
      >
        Fail
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(false);
          onPick("hold");
        }}
        className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
      >
        Hold
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
      >
        Cancel
      </button>
    </div>
  );
}

export function RoundBox({
  round,
  isLatest,
  canWrite,
  isBusy,
  href,
  wide = false,
  readOnly = false,
  onSubmitResult,
}: RoundBoxProps) {
  const cls = COLOR_CLASSES[round.color];
  const minRound = wide ? "min-w-[180px]" : "min-w-[140px]";
  const showSubmitResult =
    !readOnly &&
    canWrite &&
    round.status === "completed" &&
    round.result === "pending" &&
    !isBusy;
  const showView = round.status === "scheduled" || round.status === "rescheduled";
  const tooltip = [
    `${round.round_name?.trim() || `Round ${round.round_number}`}`,
    round.round_type ? `Type: ${round.round_type}` : null,
    round.scheduled_at ? `When: ${formatLifecycleDateTime(round.scheduled_at)}` : null,
    `Status: ${roundStatusLabel(round)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const linkSize = wide ? 11 : 10;
  const labelSize = wide ? "text-[11px]" : "text-[10px]";
  const titleSize = wide ? "text-sm" : "text-[11px]";
  const statusSize = wide ? "text-[11px]" : "text-[10px]";
  const dateSize = wide ? "text-[10px]" : "text-[9px]";
  const actionText = wide ? "text-[11px]" : "text-[10px]";

  return (
    <div
      className={`flex ${minRound} flex-col justify-between rounded-xl px-2.5 py-2 text-xs ring-1 ${cls} ${
        isLatest ? "ring-2" : ""
      }`}
      title={tooltip}
    >
      <div>
        <div
          className={`${labelSize} font-semibold uppercase tracking-wide opacity-75`}
        >
          R{round.round_number}
          {round.round_type ? ` · ${round.round_type}` : ""}
        </div>
        <div className={`mt-0.5 font-bold leading-tight ${titleSize}`}>
          {round.round_name?.trim() || `Round ${round.round_number}`}
        </div>
        <div className={`mt-1 font-medium opacity-80 ${statusSize}`}>
          {roundStatusLabel(round)}
        </div>
        {round.scheduled_at && (
          <div className={`mt-1 opacity-70 ${dateSize}`}>
            {formatLifecycleDateTime(round.scheduled_at)}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {showView && (
          <a
            href={href}
            className={`inline-flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-300 transition-colors hover:bg-white ${actionText}`}
          >
            <ExternalLink size={linkSize} /> View
          </a>
        )}

        {showSubmitResult && (
          <SubmitResultMenu
            disabled={isBusy}
            onPick={(r) => onSubmitResult(round.interview_id, r)}
          />
        )}

        {isBusy && (
          <span className="inline-flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-[10px] text-slate-600 ring-1 ring-slate-300">
            Saving…
          </span>
        )}
      </div>
    </div>
  );
}

export interface InterviewLifecycleReadOnlyStripProps {
  data: LifecyclePayload;
  compact?: boolean;
  buildInterviewHref?: (interviewId: number) => string;
}

/**
 * Read-only lifecycle pipeline (stages + rounds) for dense layouts.
 */
export function InterviewLifecycleReadOnlyStrip({
  data,
  compact,
  buildInterviewHref,
}: InterviewLifecycleReadOnlyStripProps) {
  const hrefBuilder =
    buildInterviewHref ?? ((id: number) => `/ta/interviews/${id}`);

  const interviewingStage = useMemo(
    () => data.top_level.find((s) => s.key === "Interviewing"),
    [data.top_level],
  );

  const rounds = useMemo<LifecycleRound[]>(
    () => interviewingStage?.rounds ?? [],
    [interviewingStage],
  );

  const latestRoundId = useMemo(() => {
    if (rounds.length === 0) return null;
    return [...rounds].sort((a, b) => {
      if (a.round_number !== b.round_number) {
        return b.round_number - a.round_number;
      }
      const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return bt - at;
    })[0].interview_id;
  }, [rounds]);

  const chevronStage = compact ? 16 : 20;
  const chevronRound = compact ? 14 : 18;

  return (
    <div className="w-full">
      <div className="overflow-x-auto py-1">
        <div className="flex min-w-max items-stretch">
          {data.top_level.map((stage, idx) => (
            <React.Fragment key={stage.key}>
              <StageBox stage={stage} compact={compact} />
              {idx < data.top_level.length - 1 && (
                <ChevronRight
                  size={chevronStage}
                  className={`${ARROW_CLASS} self-center mx-0.5`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Interview rounds
        </div>
        {rounds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-3 text-center text-[10px] text-slate-500">
            No interview rounds scheduled yet.
          </div>
        ) : (
          <div className="overflow-x-auto py-1">
            <div className="flex min-w-max items-stretch">
              {rounds.map((round, idx) => (
                <React.Fragment key={round.interview_id}>
                  <RoundBox
                    round={round}
                    isLatest={round.interview_id === latestRoundId}
                    canWrite={false}
                    isBusy={false}
                    readOnly
                    href={hrefBuilder(round.interview_id)}
                    onSubmitResult={() => {}}
                  />
                  {idx < rounds.length - 1 && (
                    <ChevronRight
                      size={chevronRound}
                      className={`${ARROW_CLASS} self-center mx-0.5`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
