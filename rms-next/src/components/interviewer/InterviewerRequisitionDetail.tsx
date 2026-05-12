"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiClient } from "@/lib/api/client";
import { ListError } from "@/components/ui/ListError";
import { ListSkeleton } from "@/components/ui/ListSkeleton";

type ReqItem = {
  item_id: number;
  role_position: string;
  skill_level?: string | null;
  experience_years?: number | null;
  education_requirement?: string | null;
  item_status: string;
};

type ReqDetail = {
  req_id: number;
  project_name?: string | null;
  client_name?: string | null;
  overall_status: string;
  required_by_date?: string | null;
  priority?: string | null;
  work_mode?: string | null;
  office_location?: string | null;
  created_at?: string | null;
  items: ReqItem[];
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function InterviewerRequisitionDetail() {
  const params = useParams<{ id: string }>();
  const reqId = Number.parseInt(params?.id ?? "", 10);
  const [detail, setDetail] = useState<ReqDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(reqId)) {
      setError("Invalid requisition id.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void apiClient
      .get<ReqDetail>(`/requisitions/${reqId}`)
      .then((res) => {
        if (!cancelled) setDetail(res.data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load requisition");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reqId]);

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of detail?.items ?? []) {
      map.set(item.item_status, (map.get(item.item_status) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [detail?.items]);

  if (loading) return <ListSkeleton rows={5} rowHeight={64} />;
  if (error || !detail) {
    return (
      <ListError
        title="Failed to load requisition"
        description={error ?? "Requisition not found"}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text">REQ-{detail.req_id}</h2>
          <p className="text-sm text-text-muted">Read-only requisition details for interviewer role.</p>
        </div>
        <Link href="/interviewer/requisitions" className="action-button">
          Back to Requisitions
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-text-muted">Project</p>
          <p className="text-sm font-semibold text-text">{detail.project_name ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-text-muted">Client</p>
          <p className="text-sm font-semibold text-text">{detail.client_name ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-text-muted">Status</p>
          <p className="text-sm font-semibold text-text">{detail.overall_status}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-text-muted">Required By</p>
          <p className="text-sm font-semibold text-text">{formatDate(detail.required_by_date)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-sm font-semibold text-text">Item Status Summary</p>
        <div className="flex flex-wrap gap-2">
          {statusCounts.map(([status, count]) => (
            <span key={status} className="status-badge neutral">
              {status}: {count}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-text">Item</th>
              <th className="px-4 py-3 text-left font-semibold text-text">Role</th>
              <th className="px-4 py-3 text-left font-semibold text-text">Skill Level</th>
              <th className="px-4 py-3 text-left font-semibold text-text">Experience</th>
              <th className="px-4 py-3 text-left font-semibold text-text">Education</th>
              <th className="px-4 py-3 text-left font-semibold text-text">Status</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((item) => (
              <tr key={item.item_id} className="border-t border-border">
                <td className="px-4 py-3 text-text">ITEM-{item.item_id}</td>
                <td className="px-4 py-3 text-text">{item.role_position}</td>
                <td className="px-4 py-3 text-text-muted">{item.skill_level ?? "—"}</td>
                <td className="px-4 py-3 text-text-muted">
                  {item.experience_years != null ? `${item.experience_years} yrs` : "—"}
                </td>
                <td className="px-4 py-3 text-text-muted">{item.education_requirement ?? "—"}</td>
                <td className="px-4 py-3 text-text">{item.item_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
