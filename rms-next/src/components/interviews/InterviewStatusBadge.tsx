"use client";

import React from "react";

export function normalizeInterviewStatus(status: string): string {
  return status.toUpperCase().replace(/\s+/g, "_");
}

/** Light-UI chips: slate neutrals, red for cancelled / no-show. */
const PALETTE: Record<string, string> = {
  SCHEDULED: "bg-slate-100 text-slate-800 ring-slate-200",
  COMPLETED: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  CANCELLED: "bg-red-50 text-red-800 ring-red-200",
  NO_SHOW: "bg-red-50 text-red-800 ring-red-200",
};

export function InterviewStatusBadge({ status }: { status: string }) {
  const k = normalizeInterviewStatus(status);
  const cls = PALETTE[k] ?? PALETTE.SCHEDULED;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${cls}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
