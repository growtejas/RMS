"use client";

import Link from "next/link";

import type { Interview } from "@/lib/api/candidateApi";
import { InterviewStatusBadge } from "@/components/interviews/InterviewStatusBadge";

import { formatDateTime, formatDuration, roundTitle } from "./interviewer-views-helpers";

export function InterviewerInterviewCard({
  interview,
  href,
  highlightToday,
}: {
  interview: Interview;
  href: string;
  highlightToday?: boolean;
}) {
  const time = formatDateTime(interview);
  const jobTitle = interview.role_position?.trim() || "—";

  return (
    <article
      className={`rounded-2xl border bg-surface p-4 shadow-sm ${
        highlightToday ? "border-amber-400 ring-2 ring-amber-200/80" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={href}
            className="truncate text-sm font-semibold text-text hover:underline"
          >
            {interview.candidate_name ?? `Candidate #${interview.candidate_id}`}
          </Link>
          <div className="mt-1 text-xs text-text-muted">{jobTitle}</div>
          <div className="mt-0.5 text-xs font-medium text-text">
            {roundTitle(interview)}
          </div>
        </div>
        <InterviewStatusBadge status={interview.status} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-text-muted sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]">When</div>
          <div className="mt-1 font-semibold text-text">{time.date}</div>
          <div className="text-xs">{time.time}</div>
          <div className="mt-1 text-xs">Duration: {formatDuration(interview)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]">Meeting</div>
          {interview.meeting_link ? (
            <a
              href={interview.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block break-all text-xs font-semibold text-blue-600 hover:underline"
            >
              Join link
            </a>
          ) : (
            <div className="mt-1 text-xs font-semibold text-text">—</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Link
          href={href}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          View detail →
        </Link>
      </div>
    </article>
  );
}
