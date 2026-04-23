"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { InterviewTimeline } from "@/components/interviews/InterviewTimeline";
import { fetchInterviews, type Interview } from "@/lib/api/candidateApi";

function TaInterviewsPageInner() {
  const searchParams = useSearchParams();
  const reqIdRaw = searchParams.get("requisitionId");
  const reqId = reqIdRaw != null ? Number.parseInt(reqIdRaw, 10) : NaN;

  const [rows, setRows] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(reqId)) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchInterviews({ requisitionId: reqId })
      .then((r) => {
        if (!cancelled) {
          setRows(r);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load interviews");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reqId]);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
      ),
    [rows],
  );

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 pb-12 font-sans text-slate-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2.5 text-[22px] font-bold tracking-tight text-slate-900">
          Interviews
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate-600">
          Add{" "}
          <code className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
            ?requisitionId=
          </code>{" "}
          to the URL to list scheduled rounds for that requisition (same data as the
          requisition Interviews tab).
        </p>

        {!Number.isFinite(reqId) ? (
          <p className="text-sm text-slate-600">Select a requisition to load interviews.</p>
        ) : loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-slate-600">
            No interviews scheduled for this requisition.
          </p>
        ) : (
          <InterviewTimeline interviews={sorted} />
        )}
      </div>
    </div>
  );
}

export default function TaInterviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <TaInterviewsPageInner />
    </Suspense>
  );
}
