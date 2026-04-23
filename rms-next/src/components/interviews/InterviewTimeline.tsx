"use client";

import React from "react";

import type { Interview } from "@/lib/api/candidateApi";

import { InterviewStatusBadge } from "./InterviewStatusBadge";

function formatInterviewers(iv: Interview): string {
  if (iv.panelists && iv.panelists.length > 0) {
    return iv.panelists.map((p) => p.display_name).join(", ");
  }
  return iv.interviewer_name?.trim() || "—";
}

function roundTitle(iv: Interview): string {
  if (iv.round_name?.trim()) {
    return iv.round_name.trim();
  }
  return `Round ${iv.round_number}`;
}

export function InterviewTimeline({ interviews }: { interviews: Interview[] }) {
  const sorted = [...interviews].sort(
    (a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {sorted.map((iv, idx) => (
        <div
          key={iv.id}
          className={`flex gap-4 px-4 py-4 sm:px-5 ${
            idx < sorted.length - 1 ? "border-b border-slate-200" : ""
          } ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/80"}`}
        >
          <div className="flex w-5 shrink-0 flex-col items-center">
            <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(220,38,38,0.2)]" />
            {idx < sorted.length - 1 && (
              <div className="mt-2 w-0.5 min-h-[24px] flex-1 bg-slate-200" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold tracking-tight text-slate-900">
              {roundTitle(iv)}
            </div>
            <div className="mt-1.5 text-xs leading-relaxed text-slate-600">
              {new Date(iv.scheduled_at).toLocaleString()}
              {iv.end_time
                ? ` → ${new Date(iv.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : null}
              {iv.interview_mode ? (
                <span className="ml-2 font-medium text-slate-500">
                  {iv.interview_mode}
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-xs text-slate-800">
              <span className="text-slate-500">Interviewers · </span>
              {formatInterviewers(iv)}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <InterviewStatusBadge status={iv.status} />
              {iv.result ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {iv.result}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
