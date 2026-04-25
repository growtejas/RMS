"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  fetchManagerInterviews,
  type Interview,
} from "@/lib/api/candidateApi";

import { InterviewScheduleForm } from "@/components/interviews/InterviewScheduleModal";

function ScheduleInterviewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const candidateIdRaw = searchParams.get("candidateId");
  const requisitionItemIdRaw = searchParams.get("requisitionItemId");

  const candidateId = candidateIdRaw ? Number.parseInt(candidateIdRaw, 10) : NaN;
  const requisitionItemId = requisitionItemIdRaw
    ? Number.parseInt(requisitionItemIdRaw, 10)
    : NaN;

  const [rows, setRows] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(candidateId) || !Number.isFinite(requisitionItemId)) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchManagerInterviews()
      .then((ivs) => {
        if (!cancelled) setRows(ivs);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [candidateId, requisitionItemId]);

  const nextRoundNumber = useMemo(() => {
    if (!Number.isFinite(candidateId) || !Number.isFinite(requisitionItemId)) {
      return 1;
    }
    const max = rows
      .filter(
        (iv) =>
          iv.candidate_id === candidateId &&
          (iv.requisition_item_id ?? null) === requisitionItemId,
      )
      .reduce((m, iv) => Math.max(m, iv.round_number ?? 0), 0);
    return max + 1;
  }, [rows, candidateId, requisitionItemId]);

  if (!Number.isFinite(candidateId) || !Number.isFinite(requisitionItemId)) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="text-sm font-bold text-text">Missing parameters</div>
        <div className="mt-1 text-sm text-text-muted">
          This page requires <code className="font-mono">candidateId</code> and{" "}
          <code className="font-mono">requisitionItemId</code>.
        </div>
        <div className="mt-4">
          <button
            type="button"
            className="rounded-xl border border-border bg-bg px-4 py-2 text-sm font-semibold text-text shadow-sm transition hover:bg-surface"
            onClick={() => router.push("/manager/interviews")}
          >
            Back to interviews
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-text">Schedule interview</div>
          <div className="mt-1 text-xs text-text-muted">
            Candidate #{candidateId} · Item #{requisitionItemId}
            {loading ? " · calculating next round…" : ""}
          </div>
        </div>
        <button
          type="button"
          className="rounded-xl border border-border bg-bg px-4 py-2 text-sm font-semibold text-text shadow-sm transition hover:bg-surface"
          onClick={() => router.push("/manager/interviews")}
        >
          Back
        </button>
      </div>

      <InterviewScheduleForm
        candidateId={candidateId}
        requisitionItemId={requisitionItemId}
        nextRoundNumber={nextRoundNumber}
        onScheduled={() => {
          router.push("/manager/interviews");
        }}
        onCancel={() => router.push("/manager/interviews")}
        submitMode="manager"
      />
    </div>
  );
}

export default function ScheduleInterviewPage() {
  return (
    <Suspense fallback={<div className="text-sm text-text-muted">Loading…</div>}>
      <ScheduleInterviewPageInner />
    </Suspense>
  );
}
