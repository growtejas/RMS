"use client";

import React, { useEffect, useMemo, useState } from "react";

import {
  fetchMyInterviewerInterviews,
  type Interview,
} from "@/lib/api/candidateApi";
import { InterviewerInterviewCard } from "@/components/interviewer/InterviewerInterviewCard";
import { isSameLocalDay } from "@/components/interviewer/interviewer-views-helpers";

export default function InterviewerInterviewsPage() {
  const [rows, setRows] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchMyInterviewerInterviews()
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

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
      ),
    [rows],
  );

  const now = new Date();

  if (loading) {
    return (
      <div className="p-6 text-sm text-text-muted">Loading interviews…</div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-sm text-red-900">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <p className="text-sm text-text-muted">
        All interviews where you are assigned as a panelist ({sorted.length}).
      </p>
      {sorted.length === 0 ? (
        <p className="text-sm text-text-muted">No assigned interviews yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((iv) => (
            <InterviewerInterviewCard
              key={iv.id}
              interview={iv}
              href={`/interviewer/interviews/${iv.id}`}
              highlightToday={isSameLocalDay(new Date(iv.scheduled_at), now)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
