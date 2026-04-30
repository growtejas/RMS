"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  fetchInterviewerInterviewDetail,
  submitInterviewerFeedback,
  type InterviewerInterviewDetailResponse,
  type InterviewerRecommendation,
} from "@/lib/api/candidateApi";
import { InterviewStatusBadge } from "@/components/interviews/InterviewStatusBadge";
import {
  formatDateTime,
  formatDuration,
  resumeBasename,
  roundTitle,
} from "@/components/interviewer/interviewer-views-helpers";

function isCancelled(status: string): boolean {
  return status.trim().toUpperCase() === "CANCELLED";
}

function scorecardSummary(scores: unknown): {
  recommendation?: string;
  strengths?: string;
  weaknesses?: string;
} {
  if (!scores || typeof scores !== "object") return {};
  const o = scores as Record<string, unknown>;
  return {
    recommendation:
      typeof o.recommendation === "string" ? o.recommendation : undefined,
    strengths: typeof o.strengths === "string" ? o.strengths : undefined,
    weaknesses: typeof o.weaknesses === "string" ? o.weaknesses : undefined,
  };
}

const RECOMMENDATIONS: { value: InterviewerRecommendation; label: string }[] = [
  { value: "strong_yes", label: "Strong yes" },
  { value: "yes", label: "Yes" },
  { value: "neutral", label: "Neutral" },
  { value: "no", label: "No" },
  { value: "strong_no", label: "Strong no" },
];

export default function InterviewerInterviewDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const interviewId =
    typeof rawId === "string" ? Number.parseInt(rawId, 10) : Number.NaN;

  const [detail, setDetail] = useState<InterviewerInterviewDetailResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recommendation, setRecommendation] =
    useState<InterviewerRecommendation>("neutral");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(interviewId)) {
      setError("Invalid interview id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const d = await fetchInterviewerInterviewDetail(interviewId);
      setDetail(d);
    } catch (e: unknown) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "Failed to load interview");
    } finally {
      setLoading(false);
    }
  }, [interviewId]);

  useEffect(() => {
    void load();
  }, [load]);

  const iv = detail?.interview;
  const preview = detail?.candidate_preview;
  const resumeKey = resumeBasename(preview?.resume_path ?? null);
  const resumeHref =
    resumeKey && Number.isFinite(interviewId)
      ? `/api/uploads/resume/${encodeURIComponent(resumeKey)}?interview_id=${interviewId}`
      : null;

  const cancelled = iv ? isCancelled(iv.status) : false;
  const hasSubmitted = Boolean(detail?.my_scorecard);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(interviewId) || hasSubmitted || cancelled) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitInterviewerFeedback(interviewId, {
        recommendation,
        strengths: strengths.trim() || null,
        weaknesses: weaknesses.trim() || null,
        notes: notes.trim() || null,
      });
      await load();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-text-muted">Loading interview…</div>
    );
  }

  if (error || !detail || !iv || !preview) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <p className="text-sm text-red-700">{error ?? "Interview not found."}</p>
        <Link href="/interviewer/interviews" className="text-sm font-semibold text-blue-600 hover:underline">
          ← Back to interviews
        </Link>
      </div>
    );
  }

  const when = formatDateTime(iv);

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6">
      <div>
        <Link
          href="/interviewer/interviews"
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          ← All interviews
        </Link>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-text">
              {preview.full_name}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {iv.role_position?.trim() || "Role"} · {roundTitle(iv)}
            </p>
          </div>
          <InterviewStatusBadge status={iv.status} />
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
              Scheduled
            </dt>
            <dd className="mt-1 font-medium text-text">{when.date}</dd>
            <dd className="text-text-muted">{when.time}</dd>
            <dd className="mt-1 text-xs text-text-muted">
              Duration: {formatDuration(iv)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
              Meeting
            </dt>
            <dd className="mt-1">
              {iv.meeting_link ? (
                <a
                  href={iv.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Open meeting link
                </a>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-base font-bold text-text">Candidate (limited)</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-xs font-semibold text-text-muted">Email</dt>
            <dd>{preview.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-muted">Experience</dt>
            <dd>{preview.total_experience_years ?? "—"} years</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-muted">Skills</dt>
            <dd>
              {preview.candidate_skills?.length
                ? preview.candidate_skills.join(", ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-muted">Education</dt>
            <dd className="whitespace-pre-wrap">{preview.education_raw ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-muted">Resume</dt>
            <dd>
              {resumeHref ? (
                <a
                  href={resumeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 hover:underline"
                >
                  View resume
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-base font-bold text-text">Your feedback</h2>

        {cancelled ? (
          <p className="mt-3 text-sm text-amber-800">
            This interview was cancelled; feedback cannot be submitted.
          </p>
        ) : null}

        {hasSubmitted && detail.my_scorecard ? (
          <div className="mt-4 space-y-3 rounded-xl border border-border bg-bg p-4 text-sm">
            <p className="font-semibold text-text">Submitted</p>
            <p className="text-xs text-text-muted">
              {new Date(detail.my_scorecard.submitted_at).toLocaleString()}
            </p>
            {(() => {
              const s = scorecardSummary(detail.my_scorecard.scores);
              return (
                <>
                  {s.recommendation ? (
                    <p>
                      <span className="font-semibold">Recommendation: </span>
                      {s.recommendation.replace(/_/g, " ")}
                    </p>
                  ) : null}
                  {s.strengths ? (
                    <p className="whitespace-pre-wrap">
                      <span className="font-semibold">Strengths: </span>
                      {s.strengths}
                    </p>
                  ) : null}
                  {s.weaknesses ? (
                    <p className="whitespace-pre-wrap">
                      <span className="font-semibold">Weaknesses: </span>
                      {s.weaknesses}
                    </p>
                  ) : null}
                  {detail.my_scorecard.notes ? (
                    <p className="whitespace-pre-wrap">
                      <span className="font-semibold">Notes: </span>
                      {detail.my_scorecard.notes}
                    </p>
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : null}

        {!hasSubmitted && !cancelled ? (
          <form className="mt-4 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-xs font-semibold text-text-muted" htmlFor="rec">
                Recommendation
              </label>
              <select
                id="rec"
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={recommendation}
                onChange={(e) =>
                  setRecommendation(e.target.value as InterviewerRecommendation)
                }
              >
                {RECOMMENDATIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted" htmlFor="str">
                Strengths
              </label>
              <textarea
                id="str"
                className="mt-1 min-h-[88px] w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                placeholder="What stood out positively?"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted" htmlFor="weak">
                Weaknesses
              </label>
              <textarea
                id="weak"
                className="mt-1 min-h-[88px] w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={weaknesses}
                onChange={(e) => setWeaknesses(e.target.value)}
                placeholder="Gaps or concerns?"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted" htmlFor="notes">
                Notes
              </label>
              <textarea
                id="notes"
                className="mt-1 min-h-[88px] w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes"
              />
            </div>
            {submitError ? (
              <p className="text-sm text-red-700" role="alert">
                {submitError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit feedback"}
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
