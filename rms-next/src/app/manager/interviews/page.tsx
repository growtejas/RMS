"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  fetchManagerInterviews,
  getCandidate,
  updateInterview,
  type Candidate,
  type Interview,
} from "@/lib/api/candidateApi";
import { useAuth } from "@/contexts/useAuth";

import CandidateDetailModal from "@/components/shared/CandidateDetailModal";
import { InterviewStatusBadge } from "@/components/interviews/InterviewStatusBadge";

type ManagerInterview = Interview & {
  role_position?: string | null;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatInterviewers(iv: ManagerInterview): string {
  if (iv.panelists && iv.panelists.length > 0) {
    return iv.panelists.map((p) => p.display_name).join(", ");
  }
  return iv.interviewer_name?.trim() || "—";
}

function roundTitle(iv: ManagerInterview): string {
  if (iv.round_name?.trim()) return iv.round_name.trim();
  return `Round ${iv.round_number}`;
}

function Section({
  title,
  interviews,
  onOpenCandidate,
  onOpenUpdate,
  onOpenSchedule,
}: {
  title: string;
  interviews: ManagerInterview[];
  onOpenCandidate: (iv: ManagerInterview) => void;
  onOpenUpdate: (iv: ManagerInterview) => void;
  onOpenSchedule: (iv: ManagerInterview) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-bold text-text">{title}</div>
        <div className="text-xs text-text-muted">{interviews.length} total</div>
      </div>
      {interviews.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text-muted shadow-sm">
          No interviews.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="hidden grid-cols-[1.35fr_1fr_1fr_1fr] gap-3 border-b border-border bg-bg px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted sm:grid">
            <div>Candidate</div>
            <div>When</div>
            <div>Interviewers</div>
            <div className="text-right">Status</div>
          </div>
          <div className="grid grid-cols-1 gap-0">
            {interviews.map((iv, idx) => (
              <div
                key={iv.id}
                className={`grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1.35fr_1fr_1fr_1fr] sm:items-center ${
                  idx ? "border-t border-border" : ""
                }`}
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenCandidate(iv)}
                    className="block w-full truncate text-left text-sm font-semibold text-text hover:underline"
                    title={iv.candidate_name ?? undefined}
                  >
                    {iv.candidate_name ?? `Candidate #${iv.candidate_id}`}
                  </button>
                  <div className="mt-0.5 truncate text-xs text-text-muted">
                    {iv.role_position ?? "—"} · {roundTitle(iv)}
                  </div>
                </div>

                <div className="text-xs text-text-muted sm:text-sm">
                  <div className="font-semibold text-text">
                    {new Date(iv.scheduled_at).toLocaleDateString()}
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {new Date(iv.scheduled_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {iv.end_time
                      ? ` → ${new Date(iv.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </div>
                </div>

                <div className="truncate text-xs text-text-muted sm:text-sm">
                  {formatInterviewers(iv)}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end sm:text-right">
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <InterviewStatusBadge status={iv.status} />
                    {iv.result ? (
                      <span className="rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                        {iv.result}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenUpdate(iv)}
                      className="rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:bg-surface"
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSchedule(iv)}
                      disabled={!iv.requisition_item_id}
                      title={
                        iv.requisition_item_id
                          ? "Schedule next round"
                          : "This interview is missing requisition item metadata"
                      }
                      className="rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Next round
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManagerInterviewsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const userRoles = useMemo(() => user?.roles ?? [], [user?.roles]);

  const [rows, setRows] = useState<ManagerInterview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [candidateModal, setCandidateModal] = useState<Candidate | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);

  const [updateIv, setUpdateIv] = useState<ManagerInterview | null>(null);
  const [updateResult, setUpdateResult] = useState<"PASS" | "FAIL" | "HOLD" | "">("");
  const [updateNotes, setUpdateNotes] = useState("");
  const [updateFeedback, setUpdateFeedback] = useState("");
  const [updating, setUpdating] = useState(false);

  // Scheduling is handled on a dedicated page now.

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchManagerInterviews()
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

    const today: ManagerInterview[] = [];
    const upcoming: ManagerInterview[] = [];
    const completed: ManagerInterview[] = [];

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
      // Past but not completed (e.g. NO_SHOW): treat as today bucket for visibility.
      today.push(iv);
    }

    const sortAsc = (a: ManagerInterview, b: ManagerInterview) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    today.sort(sortAsc);
    upcoming.sort(sortAsc);
    completed.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

    return { today, upcoming, completed };
  }, [rows]);

  const openCandidate = async (iv: ManagerInterview) => {
    setCandidateLoading(true);
    try {
      const cand = await getCandidate(iv.candidate_id);
      setCandidateModal(cand);
    } finally {
      setCandidateLoading(false);
    }
  };

  const openUpdate = (iv: ManagerInterview) => {
    setUpdateIv(iv);
    setUpdateResult((iv.result as "PASS" | "FAIL" | "HOLD" | null) ?? "");
    setUpdateNotes(iv.notes ?? "");
    setUpdateFeedback(iv.feedback ?? "");
  };

  const saveUpdate = async () => {
    if (!updateIv) return;
    setUpdating(true);
    try {
      const payload = {
        result: updateResult === "" ? null : updateResult,
        notes: updateNotes.trim() || null,
        feedback: updateFeedback.trim() || null,
      };
      const res = await updateInterview(updateIv.id, payload);
      setRows((prev) => prev.map((r) => (r.id === updateIv.id ? res.interview : r)));
      setUpdateIv(null);
    } finally {
      setUpdating(false);
    }
  };

  const openSchedule = (iv: ManagerInterview) => {
    if (!iv.requisition_item_id) return;
    router.push(
      `/manager/interviews/schedule?candidateId=${iv.candidate_id}&requisitionItemId=${iv.requisition_item_id}`,
    );
  };

  return (
    <div className="space-y-8">
      {loading ? (
        <div className="text-sm text-text-muted">Loading interviews…</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
          {error}
        </div>
      ) : (
        <>
          <Section
            title="Today’s Interviews"
            interviews={grouped.today}
            onOpenCandidate={openCandidate}
            onOpenUpdate={openUpdate}
            onOpenSchedule={openSchedule}
          />
          <Section
            title="Upcoming Interviews"
            interviews={grouped.upcoming}
            onOpenCandidate={openCandidate}
            onOpenUpdate={openUpdate}
            onOpenSchedule={openSchedule}
          />
          <Section
            title="Completed Interviews"
            interviews={grouped.completed}
            onOpenCandidate={openCandidate}
            onOpenUpdate={openUpdate}
            onOpenSchedule={openSchedule}
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

      {updateIv ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 px-3 py-6 backdrop-blur-[2px]"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setUpdateIv(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
            role="dialog"
            aria-modal="true"
          >
            <div className="border-b border-border bg-bg px-5 py-4">
              <div className="text-sm font-bold text-text">Update interview</div>
              <div className="mt-1 text-xs text-text-muted">
                {updateIv.candidate_name ?? `Candidate #${updateIv.candidate_id}`} ·{" "}
                {roundTitle(updateIv)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 px-5 py-4">
              <label className="text-xs font-semibold text-text-muted">
                Result
                <select
                  value={updateResult}
                  onChange={(e) =>
                    setUpdateResult(e.target.value as "PASS" | "FAIL" | "HOLD" | "")
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text"
                >
                  <option value="">(not set)</option>
                  <option value="PASS">PASS</option>
                  <option value="FAIL">FAIL</option>
                  <option value="HOLD">HOLD</option>
                </select>
              </label>

              <label className="text-xs font-semibold text-text-muted">
                Notes
                <textarea
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text"
                />
              </label>

              <label className="text-xs font-semibold text-text-muted">
                Feedback
                <textarea
                  value={updateFeedback}
                  onChange={(e) => setUpdateFeedback(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-bg px-5 py-4">
              <button
                type="button"
                className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-text shadow-sm transition hover:bg-bg"
                onClick={() => setUpdateIv(null)}
                disabled={updating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={saveUpdate}
                disabled={updating}
              >
                {updating ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Scheduling is now a full page: /manager/interviews/schedule */}
    </div>
  );
}

