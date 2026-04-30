"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link2, Search, X } from "lucide-react";

import {
  createInterview,
  createManagerInterview,
  generateInterviewMeetLink,
  updateInterview,
  type Interview,
  type InterviewCreateV2,
} from "@/lib/api/candidateApi";
import { getUsersListCached } from "@/lib/api/users-list-cache";

type UserRow = { user_id: number; username: string; is_active?: boolean };

export interface InterviewScheduleFormProps {
  candidateId: number;
  requisitionItemId: number;
  nextRoundNumber: number;
  onScheduled: (warnings: string[], interview?: Interview) => void;
  onCancel: () => void;
  disabled?: boolean;
  submitMode?: "default" | "manager";
  mode?: "schedule" | "reschedule";
  existingInterview?: Interview | null;
}

const labelCls =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted";

const fieldCls =
  "w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition focus:ring-2 focus:ring-accent/25";
const sectionTitleCls =
  "mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted";

export function InterviewScheduleForm({
  candidateId,
  requisitionItemId,
  nextRoundNumber,
  onScheduled,
  onCancel,
  disabled,
  submitMode = "default",
  mode = "schedule",
  existingInterview = null,
}: InterviewScheduleFormProps) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userQuery, setUserQuery] = useState("");
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
  const [generatingMeet, setGeneratingMeet] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const isRescheduleMode = mode === "reschedule" && existingInterview != null;

  useEffect(() => {
    void getUsersListCached<UserRow>().then((rows) => {
      setUsers(rows.filter((u) => u.is_active !== false));
    });
  }, []);

  useEffect(() => {
    if (!isRescheduleMode || !existingInterview) {
      setRoundName(`Round ${nextRoundNumber}`);
      setRoundType("TECHNICAL");
      setInterviewMode("ONLINE");
      setScheduledAt("");
      setEndAt("");
      setMeetingLink("");
      setLocation("");
      setNotes("");
      setSelectedInterviewers(new Set());
      return;
    }

    const toLocalDateTime = (iso?: string | null): string => {
      if (!iso) return "";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setRoundName(existingInterview.round_name?.trim() || `Round ${existingInterview.round_number}`);
    setRoundType(
      (existingInterview.round_type as InterviewCreateV2["round_type"] | undefined) ??
        "TECHNICAL",
    );
    setInterviewMode(
      (existingInterview.interview_mode as InterviewCreateV2["interview_mode"] | undefined) ??
        "ONLINE",
    );
    setScheduledAt(toLocalDateTime(existingInterview.scheduled_at));
    setEndAt(toLocalDateTime(existingInterview.end_time ?? null));
    setTimezone(existingInterview.timezone?.trim() || defaultTz);
    setMeetingLink(existingInterview.meeting_link?.trim() || "");
    setLocation(existingInterview.location?.trim() || "");
    setNotes(existingInterview.notes?.trim() || "");
    setSelectedInterviewers(
      new Set(
        (existingInterview.panelists ?? [])
          .map((p) => p.user_id)
          .filter((id): id is number => typeof id === "number"),
      ),
    );
  }, [defaultTz, existingInterview, isRescheduleMode, nextRoundNumber]);

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

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.username.toLowerCase().includes(q));
  }, [users, userQuery]);

  const selectedList = useMemo(() => {
    const selected = Array.from(selectedInterviewers);
    if (selected.length === 0) return [];
    const byId = new Map(users.map((u) => [u.user_id, u.username]));
    return selected
      .map((id) => ({ id, username: byId.get(id) ?? `User #${id}` }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [selectedInterviewers, users]);

  const validationErrors = useMemo(() => {
    const errs: Partial<Record<"roundName" | "scheduleTime" | "interviewers", string>> = {};
    const start = scheduledAt ? new Date(scheduledAt) : null;
    const end = endAt ? new Date(endAt) : null;
    if (!roundName.trim()) {
      errs.roundName = "Round name is required";
    }
    if (!scheduledAt || !endAt) {
      errs.scheduleTime = "Start and end time are required";
    } else if (
      !start ||
      !end ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      errs.scheduleTime = "Invalid date/time";
    } else if (end.getTime() <= start.getTime()) {
      errs.scheduleTime = "End time must be after start time";
    } else if (!isRescheduleMode && start.getTime() < Date.now() - 30_000) {
      errs.scheduleTime = "You cannot schedule in the past";
    }
    if (selectedInterviewers.size === 0) {
      errs.interviewers = "Select at least one interviewer";
    }
    return errs;
  }, [endAt, isRescheduleMode, roundName, scheduledAt, selectedInterviewers.size]);

  const isFormValid = Object.keys(validationErrors).length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!isFormValid) {
      setLocalError(Object.values(validationErrors)[0] ?? "Please fix the form");
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
    if (!isRescheduleMode && start.getTime() < Date.now() - 30_000) {
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
      let warnings: string[] = [];
      let interview: Interview | undefined;
      if (isRescheduleMode && existingInterview) {
        const result = await updateInterview(existingInterview.id, {
          round_name: payload.round_name,
          round_type: payload.round_type,
          interview_mode: payload.interview_mode,
          scheduled_at: payload.scheduled_at,
          end_time: payload.end_time,
          timezone: payload.timezone,
          interviewer_ids: payload.interviewer_ids,
          meeting_link: payload.meeting_link ?? null,
          location: payload.location ?? null,
          notes: payload.notes ?? null,
        });
        warnings = result.warnings;
        interview = result.interview;
      } else if (submitMode === "manager") {
        const result = await createManagerInterview(payload);
        warnings = result.warnings;
        interview = result.interview;
      } else {
        try {
          const result = await createInterview(payload);
          warnings = result.warnings;
          interview = result.interview;
        } catch (err: unknown) {
          const maybeStatus = (
            err as { response?: { status?: number } } | undefined
          )?.response?.status;
          // Some manager flows open this generic form; fallback to manager endpoint on 403.
          if (maybeStatus === 403) {
            const result = await createManagerInterview(payload);
            warnings = result.warnings;
            interview = result.interview;
          } else {
            throw err;
          }
        }
      }
      onScheduled(warnings, interview);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to schedule";
      setLocalError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateMeetLink = async () => {
    setLocalError(null);
    if (!scheduledAt || !endAt) {
      setLocalError("Select start and end time before generating a Meet link");
      return;
    }
    const start = new Date(scheduledAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setLocalError("Invalid interview time window");
      return;
    }
    setGeneratingMeet(true);
    try {
      const out = await generateInterviewMeetLink({
        scheduled_at: start.toISOString(),
        end_time: end.toISOString(),
        timezone: timezone.trim() || defaultTz,
        round_name: roundName.trim() || undefined,
        round_type: roundType,
        interviewer_names: selectedList.map((u) => u.username),
      });
      setInterviewMode("ONLINE");
      setMeetingLink(out.meeting_link);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not auto-generate Meet link. Please enter manually.";
      setLocalError(msg);
    } finally {
      setGeneratingMeet(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
    >
      <div className="sticky top-0 z-10 border-b border-border bg-bg px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-text">
              {isRescheduleMode ? "Reschedule interview" : "Schedule next round"}
            </div>
            <div className="mt-1 text-xs text-text-muted">
              {isRescheduleMode
                ? "Update existing interview time, panel and meeting details"
                : `Round ${nextRoundNumber} · Choose time and panel`}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-text-muted shadow-sm transition hover:bg-bg hover:text-text"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {localError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
            {localError}
          </div>
        ) : null}

        <section className="rounded-2xl border border-border bg-bg/60 p-4">
          <div className={sectionTitleCls}>Basic Info</div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
            {validationErrors.roundName ? (
              <div className="sm:col-span-2 -mt-2 text-xs text-red-700">
                {validationErrors.roundName}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-bg/60 p-4">
          <div className={sectionTitleCls}>Time &amp; Duration</div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
            {validationErrors.scheduleTime ? (
              <div className="sm:col-span-2 text-xs text-red-700">
                {validationErrors.scheduleTime}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-bg/60 p-4">
          <div className={sectionTitleCls}>Interviewers</div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className={labelCls}>Interviewers *</label>
            <div className="text-xs text-text-muted">
              {selectedInterviewers.size} selected
            </div>
          </div>

          {selectedList.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedList.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleInterviewer(u.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:bg-surface"
                  title="Remove"
                >
                  <span className="max-w-[220px] truncate">{u.username}</span>
                  <span className="text-text-muted">×</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text shadow-sm">
            <Search size={16} className="text-text-muted" aria-hidden />
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search interviewers…"
              className="w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
            />
          </div>

          <div className="max-h-56 overflow-auto rounded-xl border border-border bg-bg p-2 text-sm">
            {users.length === 0 ? (
              <span className="text-text-muted">Loading users…</span>
            ) : (
              filteredUsers.map((u) => {
                const checked = selectedInterviewers.has(u.user_id);
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => toggleInterviewer(u.user_id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition ${
                      checked ? "bg-surface" : "hover:bg-surface"
                    }`}
                  >
                    <span className="truncate text-sm font-semibold text-text">
                      {u.username}
                    </span>
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-md border ${
                        checked
                          ? "border-accent bg-accent text-white"
                          : "border-border bg-bg text-transparent"
                      }`}
                      aria-hidden
                    >
                      ✓
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {validationErrors.interviewers ? (
            <div className="mt-2 text-xs text-red-700">{validationErrors.interviewers}</div>
          ) : null}
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-bg/60 p-4">
          <div className={sectionTitleCls}>Meeting / Location</div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Meeting link</label>
              <div className="flex items-center gap-2">
                <input
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  className={fieldCls}
                  placeholder="https://meet.google.com/..."
                />
                <button
                  type="button"
                  onClick={() => void handleGenerateMeetLink()}
                  disabled={generatingMeet || submitting}
                  className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text shadow-sm transition hover:bg-bg"
                  title="Generate a unique Google Meet link using Calendar API"
                >
                  <Link2 size={14} />
                  {generatingMeet ? "Generating..." : "Generate Meet Link"}
                </button>
              </div>
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
        </section>

        <div className="mt-4 rounded-2xl border border-border bg-bg/60 p-4">
          <label className={labelCls}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`${fieldCls} min-h-[4.5rem] resize-y`}
          />
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2.5 border-t border-border bg-bg px-5 py-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text shadow-sm transition hover:bg-bg"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled || submitting || !isFormValid}
          className="rounded-xl bg-black px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? isRescheduleMode
              ? "Updating…"
              : "Scheduling…"
            : isRescheduleMode
              ? "Update"
              : "Schedule"}
        </button>
      </div>
    </form>
  );
}
