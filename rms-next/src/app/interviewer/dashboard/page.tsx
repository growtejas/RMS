"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  fetchMyInterviewerInterviews,
  type Interview,
} from "@/lib/api/candidateApi";
import { InterviewerInterviewCard } from "@/components/interviewer/InterviewerInterviewCard";
import {
  isSameLocalDay,
  startOfLocalDay,
} from "@/components/interviewer/interviewer-views-helpers";

export default function InterviewerDashboardPage() {
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

  const { today, upcoming } = useMemo(() => {
    const now = new Date();
    const dayStart = startOfLocalDay(now);
    const todayList: Interview[] = [];
    const upcomingList: Interview[] = [];
    for (const iv of rows) {
      const start = new Date(iv.scheduled_at);
      if (isSameLocalDay(start, now)) {
        todayList.push(iv);
      } else if (start.getTime() >= dayStart.getTime() + 86400000) {
        upcomingList.push(iv);
      }
    }
    todayList.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    upcomingList.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    return { today: todayList, upcoming: upcomingList.slice(0, 12) };
  }, [rows]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-text-muted">Loading your interviews…</div>
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
    <div className="space-y-8 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          Interviews where you are on the panel.{" "}
          <Link href="/interviewer/interviews" className="font-semibold text-blue-600 hover:underline">
            View all
          </Link>
        </p>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text">
          <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" aria-hidden />
          Today
        </h2>
        {today.length === 0 ? (
          <p className="text-sm text-text-muted">No interviews scheduled for today.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {today.map((iv) => (
              <InterviewerInterviewCard
                key={iv.id}
                interview={iv}
                href={`/interviewer/interviews/${iv.id}`}
                highlightToday
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold text-text">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-text-muted">No further upcoming interviews in this view.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((iv) => (
              <InterviewerInterviewCard
                key={iv.id}
                interview={iv}
                href={`/interviewer/interviews/${iv.id}`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
