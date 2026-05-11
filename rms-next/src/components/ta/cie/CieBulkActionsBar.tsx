"use client";

import React, { useCallback, useState } from "react";

import {
  fetchCieCandidateIds,
  fetchCieRecomputeJob,
  requestCieRecompute,
  requestCieRematerializeV2,
  type Candidate,
} from "@/lib/api/candidateApi";

const RECOMPUTE_MAX = 500;
const REMATERIALIZE_MAX = 500;

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCieExportCsv(candidateIds: number[], lookup: (id: number) => Candidate | undefined) {
  const header = [
    "candidate_id",
    "full_name",
    "email",
    "requisition_id",
    "last_evaluated_at",
    "suitable_role_ids",
  ];
  const lines = [header.join(",")];
  for (const id of candidateIds) {
    const c = lookup(id);
    const roleIds = (c?.cie_intel?.latest_report?.suitableRoles ?? [])
      .map((r) => r.roleId)
      .join("|");
    lines.push(
      [
        String(id),
        escapeCsvCell(c?.full_name ?? ""),
        escapeCsvCell(c?.email ?? ""),
        c != null ? String(c.requisition_id) : "",
        escapeCsvCell(c?.cie_intel?.last_evaluated_at ?? ""),
        escapeCsvCell(roleIds),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function CieBulkActionsBar({
  selectedCount,
  isAllMatchingSelected,
  excludedIds,
  selectedIds,
  totalMatching,
  filterQ,
  filterRole,
  rowLookup,
  onAfterRecompute,
  disabled,
}: {
  selectedCount: number;
  isAllMatchingSelected: boolean;
  excludedIds: Set<number>;
  selectedIds: Set<number>;
  totalMatching: number;
  filterQ: string;
  filterRole: string;
  rowLookup: (id: number) => Candidate | undefined;
  onAfterRecompute: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<{
    status: string;
    progressPct: number;
    expected: number;
    processed: number;
    ok: number | null;
    failed: number | null;
    skipped: number | null;
  } | null>(null);

  const resolveIds = useCallback(async (): Promise<number[]> => {
    if (isAllMatchingSelected) {
      const { ids } = await fetchCieCandidateIds({ q: filterQ || null, role: filterRole || null });
      return ids.filter((id) => !excludedIds.has(id));
    }
    return Array.from(selectedIds);
  }, [isAllMatchingSelected, excludedIds, selectedIds, filterQ, filterRole]);

  const onExport = useCallback(async () => {
    setMessage(null);
    try {
      const ids = await resolveIds();
      if (ids.length === 0) return;
      const csv = buildCieExportCsv(ids, rowLookup);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cie-candidates-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${ids.length} row(s).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed.");
    }
  }, [resolveIds, rowLookup]);

  const pollBulkJob = useCallback(
    async (bulkJobId: string, expectedTotal: number, runningLabel: string) => {
      let lastPoll: Awaited<ReturnType<typeof fetchCieRecomputeJob>> | null = null;
      const deadline = Date.now() + Math.max(3 * 60_000, expectedTotal * 25_000);

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const p = await fetchCieRecomputeJob(bulkJobId);
        lastPoll = p;

        const expected = p.counts.expected ?? expectedTotal;
        const processed = p.counts.processed ?? 0;
        const progressPct =
          p.progress_pct ??
          (expected > 0 ? Math.min(100, Math.round((processed / expected) * 100)) : 0);

        setLiveProgress({
          status: p.status,
          progressPct,
          expected,
          processed,
          ok: p.counts.ok,
          failed: p.counts.failed,
          skipped: p.counts.skipped,
        });

        if (p.status === "completed" || progressPct >= 100) break;
        if (p.status === "failed") break;
      }

      if (lastPoll) {
        const exp = lastPoll.counts.expected ?? expectedTotal;
        const proc = lastPoll.counts.processed ?? 0;
        const { ok, failed, skipped } = lastPoll.counts;
        const tail: string[] = [];
        if (ok != null) tail.push(`${ok} ok`);
        if (failed != null && failed > 0) tail.push(`${failed} failed`);
        if (skipped != null && skipped > 0) tail.push(`${skipped} skipped`);
        if (lastPoll.status !== "completed" && proc < exp) {
          setMessage(
            `${runningLabel} is still running in the background. Refresh the list in a minute to see updated data.`,
          );
        } else {
          const summary = tail.length > 0 ? ` · ${tail.join(", ")}` : "";
          setMessage(`${runningLabel} finished: ${proc}/${exp} processed${summary}.`);
        }
      } else {
        setMessage(`Queued ${runningLabel.toLowerCase()} for ${expectedTotal} candidate(s).`);
      }
    },
    [],
  );

  const onRecompute = useCallback(async () => {
    setMessage(null);
    const ids = await resolveIds();
    if (ids.length === 0) return;
    if (ids.length > RECOMPUTE_MAX) {
      setMessage(
        `Recompute is capped at ${RECOMPUTE_MAX} candidates per request. Refine filters or select a smaller set.`,
      );
      return;
    }
    setBusy(true);
    setLiveProgress({
      status: "queued",
      progressPct: 0,
      expected: ids.length,
      processed: 0,
      ok: null,
      failed: null,
      skipped: null,
    });
    try {
      const { bulk_job_id } = await requestCieRecompute(ids, false);
      await pollBulkJob(bulk_job_id, ids.length, "CIE recompute");
      await onAfterRecompute();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Recompute failed.");
    } finally {
      setLiveProgress(null);
      setBusy(false);
    }
  }, [resolveIds, onAfterRecompute, pollBulkJob]);

  const onRematerialize = useCallback(async () => {
    setMessage(null);
    const ids = await resolveIds();
    if (ids.length === 0) return;
    if (ids.length > REMATERIALIZE_MAX) {
      setMessage(
        `Re-materialize is capped at ${REMATERIALIZE_MAX} candidates per request. Refine filters or select a smaller set.`,
      );
      return;
    }
    setBusy(true);
    setLiveProgress({
      status: "queued",
      progressPct: 0,
      expected: ids.length,
      processed: 0,
      ok: null,
      failed: null,
      skipped: null,
    });
    try {
      const { bulk_job_id } = await requestCieRematerializeV2(ids, true);
      await pollBulkJob(bulk_job_id, ids.length, "Re-materialize v2");
      await onAfterRecompute();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Re-materialize failed.");
    } finally {
      setLiveProgress(null);
      setBusy(false);
    }
  }, [resolveIds, onAfterRecompute, pollBulkJob]);

  if (selectedCount <= 0) return null;

  return (
    <div
      className="sticky top-0 z-20 mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm"
      role="toolbar"
      aria-label="Bulk actions for selected candidates"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold leading-snug text-slate-800">
          <span className="tabular-nums text-slate-900">{selectedCount}</span>
          <span className="font-semibold"> selected</span>
          {isAllMatchingSelected && excludedIds.size === 0 ? (
            <span className="font-normal text-slate-500"> (all matching)</span>
          ) : null}
          {isAllMatchingSelected && excludedIds.size > 0 ? (
            <span className="font-normal text-slate-500"> ({excludedIds.size} excluded)</span>
          ) : null}
          <span className="font-normal text-slate-400"> · </span>
          <span className="tabular-nums font-medium text-slate-600">{totalMatching}</span>
          <span className="font-normal text-slate-500"> in current filter</span>
        </p>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            disabled={disabled || busy}
            onClick={() => void onRecompute()}
          >
            {busy ? "Working…" : "Recompute CIE"}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
            disabled={disabled || busy}
            onClick={() => void onRematerialize()}
            title="Force a fresh strict_resume_v2 parse and rebuild the canonical snapshot for the selected candidates."
          >
            Re-materialize v2
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            disabled={disabled || busy}
            onClick={() => void onExport()}
          >
            Export CSV
          </button>
        </div>
      </div>
      {busy && liveProgress ? (
        <div className="w-full space-y-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-600">
            <span className="font-medium text-slate-800">
              {liveProgress.status === "queued"
                ? "Queued…"
                : liveProgress.status === "running"
                  ? "Running…"
                  : liveProgress.status === "completed"
                    ? "Finishing…"
                    : `Status: ${liveProgress.status}`}
            </span>
            <span className="tabular-nums text-slate-700">
              {liveProgress.processed}
              <span className="text-slate-400"> / </span>
              {liveProgress.expected}
              <span className="ml-1 text-slate-500">
                ({Math.min(100, Math.max(0, Math.round(liveProgress.progressPct)))}%)
              </span>
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.max(0, Math.round(liveProgress.progressPct)))}
            aria-label="CIE recompute progress"
          >
            <div
              className="h-full rounded-full bg-slate-900 transition-[width] duration-500 ease-out"
              style={{
                width: `${Math.min(100, Math.max(0, liveProgress.progressPct))}%`,
              }}
            />
          </div>
          {liveProgress.ok != null || liveProgress.failed != null ? (
            <p className="text-[11px] text-slate-500">
              {liveProgress.ok != null ? (
                <span className="tabular-nums">{liveProgress.ok} ok</span>
              ) : null}
              {liveProgress.failed != null && liveProgress.failed > 0 ? (
                <span className="tabular-nums">
                  {liveProgress.ok != null ? " · " : ""}
                  {liveProgress.failed} failed
                </span>
              ) : null}
              {liveProgress.skipped != null && liveProgress.skipped > 0 ? (
                <span className="tabular-nums"> · {liveProgress.skipped} skipped</span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
