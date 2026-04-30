"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  fetchInterviews,
  getCandidate,
  type Candidate,
  type Interview,
} from "@/lib/api/candidateApi";
import { useAuth } from "@/contexts/useAuth";

import { InterviewScheduleForm } from "@/components/interviews/InterviewScheduleModal";
import CandidateDetailModal from "@/components/shared/CandidateDetailModal";
import { InterviewStatusBadge } from "@/components/interviews/InterviewStatusBadge";

type TaInterview = Interview & {
  role_position?: string | null;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatInterviewers(iv: TaInterview): string {
  if (iv.panelists && iv.panelists.length > 0) {
    return iv.panelists.map((p) => p.display_name).join(", ");
  }
  return iv.interviewer_name?.trim() || "—";
}

function roundTitle(iv: TaInterview): string {
  if (iv.round_name?.trim()) return iv.round_name.trim();
  return `Round ${iv.round_number}`;
}

function formatDateTime(iv: TaInterview): { date: string; time: string } {
  const start = new Date(iv.scheduled_at);
  const end = iv.end_time ? new Date(iv.end_time) : null;
  return {
    date: start.toLocaleDateString(),
    time: `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${
      end
        ? ` - ${end.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : ""
    }`,
  };
}

type InterviewCardProps = {
  interview: TaInterview;
  onOpenCandidate: (iv: TaInterview) => void;
  onOpenSchedule: (iv: TaInterview) => void;
  onOpenReschedule: (iv: TaInterview) => void;
};

const InterviewCard = memo(function InterviewCard({
  interview,
  onOpenCandidate,
  onOpenSchedule,
  onOpenReschedule,
}: InterviewCardProps) {
  const time = formatDateTime(interview);
  const canScheduleNext = Boolean(interview.requisition_item_id);
  const interviewerNames = interview.panelists?.length
    ? interview.panelists.map((p) => p.display_name)
    : formatInterviewers(interview).split(",").map((x) => x.trim());
  return (
    <article className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onOpenCandidate(interview)}
            className="truncate text-left text-sm font-semibold text-text hover:underline"
            title={interview.candidate_name ?? undefined}
          >
            {interview.candidate_name ?? `Candidate #${interview.candidate_id}`}
          </button>
          <div className="mt-1 text-xs text-text-muted">
            Round {interview.round_number} - {roundTitle(interview)}
          </div>
        </div>
        <InterviewStatusBadge status={interview.status} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-text-muted sm:grid-cols-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]">Date & Time</div>
          <div className="mt-1 font-semibold text-text">{time.date}</div>
          <div className="text-xs">{time.time}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]">Mode</div>
          <div className="mt-1 font-semibold text-text">
            {interview.interview_mode === "OFFLINE" ? "Offline" : "Online"}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]">Interviewers</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {interviewerNames.slice(0, 4).map((name) => (
              <span
                key={`${interview.id}-${name}`}
                className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs font-semibold text-text"
              >
                {name}
              </span>
            ))}
            {interviewerNames.length > 4 ? (
              <span className="text-xs text-text-muted">+{interviewerNames.length - 4} more</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenSchedule(interview)}
          disabled={!canScheduleNext}
          className="rounded-xl bg-black px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Schedule Next Round
        </button>
        <button
          type="button"
          onClick={() => onOpenReschedule(interview)}
          className="rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:bg-surface"
        >
          Reschedule
        </button>
        <button
          type="button"
          onClick={() => onOpenCandidate(interview)}
          className="rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:bg-surface"
        >
          View Details
        </button>
      </div>
    </article>
  );
});

function Section({
  title,
  interviews,
  onOpenCandidate,
  onOpenSchedule,
  onOpenReschedule,
  page,
  onPageChange,
}: {
  title: string;
  interviews: TaInterview[];
  onOpenCandidate: (iv: TaInterview) => void;
  onOpenSchedule: (iv: TaInterview) => void;
  onOpenReschedule: (iv: TaInterview) => void;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(interviews.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const paged = interviews.slice(start, start + PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-bold text-text">{title}</div>
        <div className="text-xs text-text-muted">
          {interviews.length} total
          {interviews.length > PAGE_SIZE ? ` · Page ${currentPage}/${totalPages}` : ""}
        </div>
      </div>
      {interviews.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text-muted shadow-sm">
          No interviews.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {paged.map((iv) => (
            <InterviewCard
              key={iv.id}
              interview={iv}
              onOpenCandidate={onOpenCandidate}
              onOpenSchedule={onOpenSchedule}
              onOpenReschedule={onOpenReschedule}
            />
          ))}
          {totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                className="rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                className="rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

type ScheduleState =
  | { mode: "closed" }
  | {
      mode: "schedule" | "reschedule";
      interview: TaInterview;
      nextRoundNumber: number;
    };

export default function TaInterviewsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const userRoles = useMemo(() => user?.roles ?? [], [user?.roles]);

  const [rows, setRows] = useState<TaInterview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [candidateModal, setCandidateModal] = useState<Candidate | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);

  const [scheduleState, setScheduleState] = useState<ScheduleState>({ mode: "closed" });
  const [paging, setPaging] = useState({ today: 1, upcoming: 1, completed: 1 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchInterviews({})
      .then((ivs) => {
        if (!cancelled) setRows(ivs);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const now = new Date();
    const todayStart = startOfLocalDay(now).getTime();
    const tomorrowStart = new Date(todayStart + 24 * 60 * 60 * 1000).getTime();

    const today: TaInterview[] = [];
    const upcoming: TaInterview[] = [];
    const completed: TaInterview[] = [];

    for (const iv of rows) {
      const t = new Date(iv.scheduled_at).getTime();
      const status = String(iv.status || "").toUpperCase().replace(/\s+/g, "_");

      if (status === "COMPLETED" || status === "CANCELLED") {
        completed.push(iv);
        continue;
      }
      if (t >= todayStart && t < tomorrowStart) {
        today.push(iv);
        continue;
      }
      if (t >= tomorrowStart) {
        upcoming.push(iv);
        continue;
      }
      today.push(iv);
    }

    const sortAsc = (a: TaInterview, b: TaInterview) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    today.sort(sortAsc);
    upcoming.sort(sortAsc);
    completed.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

    return { today, upcoming, completed };
  }, [rows]);

  const hasAnyInterviews =
    grouped.today.length + grouped.upcoming.length + grouped.completed.length > 0;

  const openCandidate = useCallback(async (iv: TaInterview) => {
    setCandidateLoading(true);
    try {
      const cand = await getCandidate(iv.candidate_id);
      setCandidateModal(cand);
    } finally {
      setCandidateLoading(false);
    }
  }, []);

  const openSchedule = useCallback((iv: TaInterview) => {
    if (!iv.requisition_item_id) return;
    const maxRound = rows
      .filter(
        (r) =>
          r.candidate_id === iv.candidate_id && (r.requisition_item_id ?? null) === iv.requisition_item_id,
      )
      .reduce((m, r) => Math.max(m, r.round_number ?? 0), 0);
    setScheduleState({
      mode: "schedule",
      interview: iv,
      nextRoundNumber: maxRound + 1,
    });
  }, [rows]);

  const openReschedule = useCallback((iv: TaInterview) => {
    setScheduleState({
      mode: "reschedule",
      interview: iv,
      nextRoundNumber: iv.round_number,
    });
  }, []);

  const closeScheduler = useCallback(() => setScheduleState({ mode: "closed" }), []);

  const onScheduled = useCallback((_: string[], interview?: Interview) => {
    if (scheduleState.mode === "reschedule" && interview) {
      setRows((prev) => prev.map((r) => (r.id === interview.id ? (interview as TaInterview) : r)));
    } else {
      void fetchInterviews({}).then((ivs) => setRows(ivs));
    }
    setScheduleState({ mode: "closed" });
  }, [scheduleState.mode]);

  return (
    <div className="space-y-8">
      {loading ? (
        <div className="text-sm text-text-muted">Loading interviews…</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
          {error}
        </div>
      ) : !hasAnyInterviews ? (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="text-base font-bold text-text">No interviews scheduled</div>
          <div className="mt-1 text-sm text-text-muted">
            Start by selecting a candidate and scheduling the first interview round.
          </div>
          <div className="mt-4">
            <button
              type="button"
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black/90"
              onClick={() => router.push("/ta/requisitions")}
            >
              Schedule Interview
            </button>
          </div>
        </div>
      ) : (
        <>
          <Section
            title="Today’s Interviews"
            interviews={grouped.today}
            onOpenCandidate={openCandidate}
            onOpenSchedule={openSchedule}
            onOpenReschedule={openReschedule}
            page={paging.today}
            onPageChange={(page) => setPaging((prev) => ({ ...prev, today: page }))}
          />
          <Section
            title="Upcoming Interviews"
            interviews={grouped.upcoming}
            onOpenCandidate={openCandidate}
            onOpenSchedule={openSchedule}
            onOpenReschedule={openReschedule}
            page={paging.upcoming}
            onPageChange={(page) => setPaging((prev) => ({ ...prev, upcoming: page }))}
          />
          <Section
            title="Completed Interviews"
            interviews={grouped.completed}
            onOpenCandidate={openCandidate}
            onOpenSchedule={openSchedule}
            onOpenReschedule={openReschedule}
            page={paging.completed}
            onPageChange={(page) => setPaging((prev) => ({ ...prev, completed: page }))}
          />
        </>
      )}

      {candidateLoading ? (
        <div className="fixed bottom-4 right-4 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-muted shadow-sm">
          Loading candidate…
        </div>
      ) : null}

      {candidateModal ? (
        <CandidateDetailModal
          candidate={candidateModal}
          userRoles={userRoles}
          onUpdate={setCandidateModal}
          onClose={() => setCandidateModal(null)}
        />
      ) : null}

      {scheduleState.mode !== "closed" ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 px-3 py-4 backdrop-blur-[3px] sm:py-6"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && closeScheduler()}
        >
          <div className="w-full max-w-5xl">
            <InterviewScheduleForm
              candidateId={scheduleState.interview.candidate_id}
              requisitionItemId={scheduleState.interview.requisition_item_id ?? 0}
              nextRoundNumber={scheduleState.nextRoundNumber}
              submitMode="default"
              mode={scheduleState.mode}
              existingInterview={
                scheduleState.mode === "reschedule" ? scheduleState.interview : null
              }
              onCancel={closeScheduler}
              onScheduled={onScheduled}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
