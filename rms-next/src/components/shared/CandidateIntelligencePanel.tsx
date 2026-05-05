"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import type { Candidate } from "@/lib/api/candidateApi";
import {
  askCandidateCie,
  fetchCieConversations,
  fetchCieRecomputeJob,
  requestCieRecompute,
} from "@/lib/api/candidateApi";

export function CandidateIntelligencePanel({
  candidate,
  onRefresh,
}: {
  candidate: Candidate;
  onRefresh: () => void | Promise<void>;
}) {
  const cie = candidate.cie_intel;
  const report = cie?.latest_report ?? null;
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [recomputeBusy, setRecomputeBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [thread, setThread] = useState<
    Array<{ id: number; question: string; answer: string; confidence: number | null }>
  >([]);

  /** Supersedes in-flight poll loops when user clicks Refresh again or unmounts. */
  const recomputePollGenRef = useRef(0);

  useEffect(
    () => () => {
      recomputePollGenRef.current += 1;
      setRecomputeBusy(false);
    },
    [],
  );

  const loadThread = useCallback(async () => {
    try {
      const { conversations } = await fetchCieConversations(candidate.candidate_id, 20);
      setThread(
        conversations.map((c) => ({
          id: c.id,
          question: c.question,
          answer: c.answer,
          confidence: c.confidence,
        })),
      );
    } catch {
      setThread([]);
    }
  }, [candidate.candidate_id]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  const handleAsk = async () => {
    const q = question.trim();
    if (q.length < 3) return;
    setAsking(true);
    setChatError(null);
    try {
      await askCandidateCie(candidate.candidate_id, q, null);
      setQuestion("");
      await loadThread();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Could not get answer.");
    } finally {
      setAsking(false);
    }
  };

  const handleRecompute = async () => {
    const gen = ++recomputePollGenRef.current;
    setRecomputeBusy(true);
    setChatError(null);
    try {
      const { bulk_job_id } = await requestCieRecompute([candidate.candidate_id], true);
      if (gen !== recomputePollGenRef.current) return;

      let status = "running";
      for (let i = 0; i < 45 && status !== "completed"; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (gen !== recomputePollGenRef.current) return;
        const poll = await fetchCieRecomputeJob(bulk_job_id);
        if (gen !== recomputePollGenRef.current) return;
        status = poll.status ?? "";
        if (poll.progress_pct >= 100) break;
      }
      if (gen !== recomputePollGenRef.current) return;
      await onRefresh();
    } catch (e) {
      if (gen === recomputePollGenRef.current) {
        setChatError(e instanceof Error ? e.message : "Recompute failed.");
      }
    } finally {
      if (gen === recomputePollGenRef.current) {
        setRecomputeBusy(false);
      }
    }
  };

  const sectionTitle = (t: string) => (
    <div
      style={{
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--text-tertiary)",
        marginBottom: "8px",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      {t}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={recomputeBusy}
            className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            onClick={() => void handleRecompute()}
          >
            {recomputeBusy ? "Refreshing…" : "Refresh intelligence"}
          </button>
          {cie?.last_evaluated_at ? (
            <span className="text-xs text-slate-500">
              Last evaluated {new Date(cie.last_evaluated_at).toLocaleString()}
              {cie.confidence_score != null
                ? ` · confidence ${(cie.confidence_score * 100).toFixed(0)}%`
                : ""}
            </span>
          ) : (
            <span className="text-xs text-slate-500">No report yet — run refresh.</span>
          )}
        </div>

        {!report ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
            No intelligence report is available. Ensure the resume is parsed (structured
            profile) and click Refresh intelligence.
          </div>
        ) : (
          <>
            <div>
              {sectionTitle("Summary")}
              <p className="text-sm leading-relaxed text-slate-800">{report.summary}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                {sectionTitle("Strengths")}
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
                  {report.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                {sectionTitle("Weaknesses")}
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
                  {report.weaknesses.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              {sectionTitle("Suitable roles")}
              <div className="flex flex-wrap gap-2">
                {report.suitableRoles.map((r, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div>
              {sectionTitle("Education insights")}
              <p className="text-sm text-slate-700">
                <strong>{report.educationInsights.relevance}</strong> —{" "}
                {report.educationInsights.notes}
              </p>
            </div>
            <div>
              {sectionTitle("Risk flags")}
              {report.riskFlags.length === 0 ? (
                <p className="text-sm text-slate-500">None highlighted.</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm text-amber-900">
                  {report.riskFlags.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              {sectionTitle("Skills")}
              <p className="text-xs text-slate-500">
                Primary: {report.primarySkills.join(", ") || "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Secondary: {report.secondarySkills.join(", ") || "—"}
              </p>
              <p className="mt-2 text-xs font-medium text-slate-600">
                Experience level: {report.experienceLevel}
              </p>
            </div>
          </>
        )}
      </div>

      <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:w-[320px]">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Ask about this candidate
        </div>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Is this person a fit for a senior backend role?"
          rows={3}
          className="mb-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={asking || question.trim().length < 3}
          className="mb-3 w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          onClick={() => void handleAsk()}
        >
          {asking ? "Asking…" : "Ask"}
        </button>
        {chatError ? <p className="mb-2 text-xs text-red-600">{chatError}</p> : null}
        <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1 text-xs">
          {thread.length === 0 ? (
            <p className="text-slate-500">No questions yet.</p>
          ) : (
            thread.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <div className="font-medium text-slate-800">Q: {t.question}</div>
                <div className="mt-1 text-slate-700">A: {t.answer}</div>
                {t.confidence != null ? (
                  <div className="mt-1 text-[10px] text-slate-500">
                    Confidence {(t.confidence * 100).toFixed(0)}%
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
