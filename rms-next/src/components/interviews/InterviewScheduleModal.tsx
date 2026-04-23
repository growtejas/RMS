"use client";

import React, { useEffect, useMemo, useState } from "react";

import {
  createInterview,
  type InterviewCreateV2,
} from "@/lib/api/candidateApi";
import { getUsersListCached } from "@/lib/api/users-list-cache";

type UserRow = { user_id: number; username: string; is_active?: boolean };

export interface InterviewScheduleFormProps {
  candidateId: number;
  requisitionItemId: number;
  nextRoundNumber: number;
  onScheduled: (warnings: string[]) => void;
  onCancel: () => void;
  disabled?: boolean;
}

const labelCls =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500";

const fieldCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

export function InterviewScheduleForm({
  candidateId,
  requisitionItemId,
  nextRoundNumber,
  onScheduled,
  onCancel,
  disabled,
}: InterviewScheduleFormProps) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roundName, setRoundName] = useState(`Round ${nextRoundNumber}`);
  const [roundType, setRoundType] =
    useState<InterviewCreateV2["round_type"]>("TECHNICAL");
  const [interviewMode, setInterviewMode] =
    useState<InterviewCreateV2["interview_mode"]>("ONLINE");
  const [scheduledAt, setScheduledAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const defaultTz = useMemo(
    () =>
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC",
    [],
  );
  const [timezone, setTimezone] = useState(defaultTz);
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedInterviewers, setSelectedInterviewers] = useState<Set<number>>(
    new Set(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void getUsersListCached<UserRow>().then((rows) => {
      setUsers(rows.filter((u) => u.is_active !== false));
    });
  }, []);

  const toggleInterviewer = (id: number) => {
    setSelectedInterviewers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!roundName.trim()) {
      setLocalError("Round name is required");
      return;
    }
    if (!scheduledAt || !endAt) {
      setLocalError("Start and end time are required");
      return;
    }
    const start = new Date(scheduledAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setLocalError("Invalid date/time");
      return;
    }
    if (end.getTime() <= start.getTime()) {
      setLocalError("End time must be after start time");
      return;
    }
    if (start.getTime() < Date.now() - 30_000) {
      setLocalError("You cannot schedule in the past");
      return;
    }
    const interviewerIds = Array.from(selectedInterviewers);
    if (interviewerIds.length === 0) {
      setLocalError("Select at least one interviewer");
      return;
    }

    const payload: InterviewCreateV2 = {
      candidate_id: candidateId,
      requisition_item_id: requisitionItemId,
      round_name: roundName.trim(),
      round_type: roundType,
      interview_mode: interviewMode,
      scheduled_at: start.toISOString(),
      end_time: end.toISOString(),
      timezone: timezone.trim() || defaultTz,
      interviewer_ids: interviewerIds,
      meeting_link: meetingLink.trim() || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      const { warnings } = await createInterview(payload);
      onScheduled(warnings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to schedule";
      setLocalError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-slate-200 pb-3.5">
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-red-600">
            New interview
          </div>
          <div className="text-base font-bold tracking-tight text-slate-900">
            Schedule round {nextRoundNumber}
          </div>
        </div>
      </div>

      {localError ? (
        <div className="mb-3.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
          {localError}
        </div>
      ) : null}

      <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Round name *</label>
          <input
            value={roundName}
            onChange={(e) => setRoundName(e.target.value)}
            required
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>Round type *</label>
          <select
            value={roundType}
            onChange={(e) =>
              setRoundType(e.target.value as InterviewCreateV2["round_type"])
            }
            className={fieldCls}
          >
            <option value="TECHNICAL">Technical</option>
            <option value="HR">HR</option>
            <option value="MANAGERIAL">Managerial</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Mode *</label>
          <select
            value={interviewMode}
            onChange={(e) =>
              setInterviewMode(
                e.target.value as InterviewCreateV2["interview_mode"],
              )
            }
            className={fieldCls}
          >
            <option value="ONLINE">Online</option>
            <option value="OFFLINE">Offline</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Timezone (IANA) *</label>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="e.g. Asia/Kolkata"
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>Start *</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => {
              const v = e.target.value;
              setScheduledAt(v);
              if (v) {
                const start = new Date(v);
                const end = new Date(start.getTime() + 60 * 60 * 1000);
                const pad = (n: number) => String(n).padStart(2, "0");
                setEndAt(
                  `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`,
                );
              }
            }}
            min={new Date().toISOString().slice(0, 16)}
            required
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>End *</label>
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            required
            className={fieldCls}
          />
        </div>
      </div>

      <div className="mb-3.5">
        <label className={labelCls}>Interviewers *</label>
        <div className="max-h-40 overflow-auto rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm">
          {users.length === 0 ? (
            <span className="text-slate-500">Loading users…</span>
          ) : (
            users.map((u) => (
              <label
                key={u.user_id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-2 text-slate-800 hover:bg-white"
              >
                <input
                  type="checkbox"
                  checked={selectedInterviewers.has(u.user_id)}
                  onChange={() => toggleInterviewer(u.user_id)}
                  className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span>{u.username}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Meeting link</label>
          <input
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={fieldCls}
          />
        </div>
      </div>

      <div className="mb-4">
        <label className={labelCls}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${fieldCls} min-h-[4.5rem] resize-y`}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled || submitting}
          className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Scheduling…" : "Schedule"}
        </button>
      </div>
    </form>
  );
}
