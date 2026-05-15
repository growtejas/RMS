"use client";

/**
 * InterviewLifecycle — horizontal hybrid pipeline for the candidate profile.
 *
 *   [Sourced] → [Shortlisted] → [Interviewing (rounds: Screening → GD → Tech → HM)]
 *               → [Offered] → [Hired]
 *
 * Top-level boxes reflect `applications.current_stage`; the `Interviewing`
 * box expands inline to show interview rounds belonging to the application
 * (cancelled rounds are filtered out).
 *
 * Color logic (per spec):
 *   not started → grey, scheduled → blue, completed+pending → yellow,
 *   passed → green, failed → red, no_show → orange.
 */

import React, { useCallback, useMemo, useState } from "react";
import { ChevronRight, CalendarPlus, AlertCircle } from "lucide-react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  fetchApplicationLifecycle,
  submitInterviewResultApi,
  getCandidateActionErrorMessage,
  type LifecycleResult,
  type LifecycleRound,
  type LifecyclePayload,
} from "@/lib/api/candidateApi";
import {
  ARROW_CLASS,
  RoundBox,
  StageBox,
} from "@/components/shared/InterviewLifecycleDisplay";
import { InterviewScheduleForm } from "@/components/interviews/InterviewScheduleModal";
import { Loader } from "@/components/ui/Loader";

export interface InterviewLifecycleProps {
  applicationId: number;
  candidateId: number;
  requisitionItemId: number;
  userRoles: string[];
  /** Defaults to `/ta/interviews/{id}`. */
  buildInterviewHref?: (interviewId: number) => string;
  /** Refresh callback so parent (CandidateDetailView) can reload candidate after a write. */
  onLifecycleChanged?: () => void;
}

const lifecycleQueryKey = (applicationId: number) =>
  ["lifecycle", applicationId] as const;

function isWriter(roles: string[]): boolean {
  return roles.some((r) => {
    const role = r.trim().toLowerCase();
    return role === "ta" || role === "hr" || role === "admin";
  });
}

export default function InterviewLifecycle({
  applicationId,
  candidateId,
  requisitionItemId,
  userRoles,
  buildInterviewHref,
  onLifecycleChanged,
}: InterviewLifecycleProps) {
  const qc = useQueryClient();
  const canWrite = isWriter(userRoles);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: lifecycleQueryKey(applicationId),
    queryFn: () => fetchApplicationLifecycle(applicationId),
    staleTime: 30_000,
    enabled: Number.isFinite(applicationId) && applicationId > 0,
  });

  const [showScheduler, setShowScheduler] = useState(false);
  const [resultBusyId, setResultBusyId] = useState<number | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  const submitResult = useMutation({
    mutationFn: ({
      interviewId,
      result,
    }: {
      interviewId: number;
      result: Exclude<LifecycleResult, "pending">;
    }) => submitInterviewResultApi(interviewId, result),
    onMutate: ({ interviewId }) => {
      setResultBusyId(interviewId);
      setResultError(null);
    },
    onSuccess: (payload: LifecyclePayload) => {
      qc.setQueryData(lifecycleQueryKey(applicationId), payload);
      qc.invalidateQueries({ queryKey: lifecycleQueryKey(applicationId) });
      onLifecycleChanged?.();
    },
    onError: (err) => {
      setResultError(
        getCandidateActionErrorMessage(err, "Failed to submit result"),
      );
    },
    onSettled: () => {
      setResultBusyId(null);
    },
  });

  const handleResult = useCallback(
    (interviewId: number, result: Exclude<LifecycleResult, "pending">) => {
      submitResult.mutate({ interviewId, result });
    },
    [submitResult],
  );

  const interviewingStage = useMemo(
    () => data?.top_level.find((s) => s.key === "Interviewing"),
    [data?.top_level],
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

  if (isLoading) {
    return (
      <div className="my-4 flex items-center gap-2 text-sm text-slate-500">
        <Loader /> Loading interview lifecycle…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="my-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div>
          Failed to load interview lifecycle:{" "}
          {getCandidateActionErrorMessage(error, "unknown error")}
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-2 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const hrefBuilder =
    buildInterviewHref ?? ((id: number) => `/ta/interviews/${id}`);

  return (
    <section className="mt-4 mb-6 rounded-2xl border border-slate-200 bg-white px-4 pb-4 pt-5 shadow-sm">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          Interview Lifecycle
        </h3>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {data.is_rejected ? (
            <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-800 ring-1 ring-red-200">
              Application rejected — pipeline closed
            </span>
          ) : (
            <span>
              Currently:{" "}
              <span className="font-semibold text-slate-700">
                {data.current_stage}
              </span>
            </span>
          )}
        </div>
      </header>

      {resultError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {resultError}
        </div>
      )}

      <div className="h-4" />

      <div className="overflow-x-auto px-1 py-2">
        <div className="flex min-w-max items-stretch">
          {data.top_level.map((stage, idx) => (
            <React.Fragment key={stage.key}>
              <StageBox stage={stage} />
              {idx < data.top_level.length - 1 && (
                <ChevronRight
                  size={20}
                  className={`${ARROW_CLASS} self-center mx-1`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Inner: interview rounds */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Interview Rounds
          </h4>
          {canWrite && !data.is_rejected && (
            <button
              type="button"
              disabled={!data.can_schedule_next}
              onClick={() => setShowScheduler((s) => !s)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors ${
                data.can_schedule_next
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "cursor-not-allowed bg-slate-400"
              }`}
              title={
                data.can_schedule_next
                  ? "Schedule next interview round"
                  : "Next round unlocks only after latest active round is Completed + Pass"
              }
            >
              <CalendarPlus size={13} />{" "}
              {showScheduler ? "Cancel" : "Schedule Next Round"}
            </button>
          )}
        </div>

        {canWrite && !data.is_rejected && !data.can_schedule_next && (
          <p className="mb-2 text-[11px] text-slate-500">
            Next round is locked until the latest active round is marked{" "}
            <span className="font-semibold text-slate-700">Completed + Passed</span>.
          </p>
        )}

        {showScheduler && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <InterviewScheduleForm
              candidateId={candidateId}
              requisitionItemId={requisitionItemId}
              nextRoundNumber={data.next_round_number}
              submitMode={
                userRoles.includes("Manager") ? "manager" : "default"
              }
              onCancel={() => setShowScheduler(false)}
              onScheduled={() => {
                setShowScheduler(false);
                qc.invalidateQueries({
                  queryKey: lifecycleQueryKey(applicationId),
                });
                onLifecycleChanged?.();
              }}
            />
          </div>
        )}

        {rounds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-xs text-slate-500">
            No interview rounds scheduled yet.
          </div>
        ) : (
          <div className="overflow-x-auto px-1 py-2">
            <div className="flex min-w-max items-stretch">
              {rounds.map((round, idx) => (
                <React.Fragment key={round.interview_id}>
                  <RoundBox
                    round={round}
                    isLatest={round.interview_id === latestRoundId}
                    canWrite={false}
                    isBusy={resultBusyId === round.interview_id}
                    wide
                    readOnly={false}
                    onSubmitResult={handleResult}
                    href={hrefBuilder(round.interview_id)}
                  />
                  {idx < rounds.length - 1 && (
                    <ChevronRight
                      size={18}
                      className={`${ARROW_CLASS} self-center mx-1`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
