"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { fetchMyInterviewerInterviews, type Interview } from "@/lib/api/candidateApi";
import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListError } from "@/components/ui/ListError";
import { ListSkeleton } from "@/components/ui/ListSkeleton";

type RequisitionSummary = {
  requisitionId: number;
  roles: string[];
  interviewCount: number;
  upcomingInterviewAt: string | null;
  latestInterviewAt: string | null;
};

function toLocalDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InterviewerRequisitions() {
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
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load requisitions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requisitions = useMemo<RequisitionSummary[]>(() => {
    const nowMs = Date.now();
    const byReq = new Map<number, RequisitionSummary>();
    for (const iv of rows) {
      const reqId = iv.requisition_id ?? null;
      if (!reqId) continue;
      const row =
        byReq.get(reqId) ??
        {
          requisitionId: reqId,
          roles: [],
          interviewCount: 0,
          upcomingInterviewAt: null,
          latestInterviewAt: null,
        };
      row.interviewCount += 1;
      if (iv.role_position && !row.roles.includes(iv.role_position)) {
        row.roles.push(iv.role_position);
      }
      const scheduledMs = new Date(iv.scheduled_at).getTime();
      if (Number.isFinite(scheduledMs)) {
        if (!row.latestInterviewAt || scheduledMs > new Date(row.latestInterviewAt).getTime()) {
          row.latestInterviewAt = iv.scheduled_at;
        }
        if (scheduledMs >= nowMs) {
          if (!row.upcomingInterviewAt || scheduledMs < new Date(row.upcomingInterviewAt).getTime()) {
            row.upcomingInterviewAt = iv.scheduled_at;
          }
        }
      }
      byReq.set(reqId, row);
    }
    return [...byReq.values()].sort((a, b) => {
      const aMs = a.upcomingInterviewAt ? new Date(a.upcomingInterviewAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bMs = b.upcomingInterviewAt ? new Date(b.upcomingInterviewAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (aMs !== bMs) return aMs - bMs;
      return b.requisitionId - a.requisitionId;
    });
  }, [rows]);

  if (loading) {
    return <ListSkeleton rows={6} rowHeight={62} />;
  }

  if (error) {
    return <ListError title="Failed to load requisitions" description={error} />;
  }

  if (requisitions.length === 0) {
    return (
      <ListEmpty
        title="No requisitions assigned yet"
        description="Requisitions will appear here when you are assigned as a panelist."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Read-only requisitions inferred from your assigned interviews.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-text">Requisition</th>
              <th className="px-4 py-3 text-left font-semibold text-text">Roles</th>
              <th className="px-4 py-3 text-left font-semibold text-text">Assigned Interviews</th>
              <th className="px-4 py-3 text-left font-semibold text-text">Next Interview</th>
              <th className="px-4 py-3 text-left font-semibold text-text">Latest Activity</th>
              <th className="px-4 py-3 text-left font-semibold text-text">Action</th>
            </tr>
          </thead>
          <tbody>
            {requisitions.map((req) => (
              <tr key={req.requisitionId} className="border-t border-border">
                <td className="px-4 py-3 font-medium text-text">REQ-{req.requisitionId}</td>
                <td className="px-4 py-3 text-text-muted">
                  {req.roles.length > 0 ? req.roles.join(", ") : "—"}
                </td>
                <td className="px-4 py-3 text-text">{req.interviewCount}</td>
                <td className="px-4 py-3 text-text-muted">{toLocalDateTime(req.upcomingInterviewAt)}</td>
                <td className="px-4 py-3 text-text-muted">{toLocalDateTime(req.latestInterviewAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/interviewer/requisitions/${req.requisitionId}`} className="action-button">
                    View (Read-only)
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
