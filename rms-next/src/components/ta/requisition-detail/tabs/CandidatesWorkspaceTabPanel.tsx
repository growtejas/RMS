"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clipboard,
  LayoutGrid,
  List,
  Mail,
  RefreshCw,
  Search,
  SearchX,
  User,
  Wrench,
  X,
} from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import {
  fetchRequisitionCandidatesWorkspace,
  type RequisitionWorkspaceCandidateRow,
} from "@/lib/api/candidateApi";
import { ListFooter } from "@/components/ui/ListFooter";
import { VirtualList } from "@/components/ui/VirtualList";
import type { TicketData } from "@/components/ta/requisition-detail/types";
import {
  DEFAULT_PAGE_SIZE,
  type PageSize,
} from "@/lib/pagination/contract";
import { qk } from "@/lib/query/keys";

/**
 * Phase 6 - virtualize the list view when more than this many rows are
 * mounted. Below the threshold the flat list keeps grid alignment and
 * avoids the contain-strict layout cost.
 */
const VIRTUALIZE_LIST_THRESHOLD = 50;

const VIEW_MODE_KEY = "ta-req-candidates-view-mode";

type ViewMode = "grid" | "list";

const WORKSPACE_INTERVIEW_STATUS = [
  "any",
  "none",
  "scheduled",
  "in_progress",
  "failed",
  "rejected",
  "passed_latest",
] as const;

const INTERVIEW_STATUS_LABELS: Record<string, string> = {
  any: "Any interview status",
  none: "No interviews yet",
  scheduled: "Has scheduled round",
  in_progress: "In progress (pending / hold / no-show)",
  failed: "Latest round failed",
  rejected: "Rejected (stage or failed)",
  passed_latest: "Latest round passed",
};

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

function isValidYyyyMmDd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function interviewRoundStatusLabel(
  status: string,
  result: string,
): string {
  if (status === "completed") {
    if (result === "passed") return "Passed";
    if (result === "failed") return "Failed";
    if (result === "hold") return "On hold";
    return "Completed";
  }
  if (status === "scheduled") return "Scheduled";
  if (status === "rescheduled") return "Rescheduled";
  if (status === "no_show") return "No show";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

function interviewRoundTitle(roundNumber: number, roundName: string | null): string {
  const name = roundName?.trim();
  if (!name) return `Round ${roundNumber}`;
  const low = name.toLowerCase();
  if (
    low === `round ${roundNumber}` ||
    low === `r${roundNumber}` ||
    low.startsWith(`r${roundNumber} `) ||
    low.includes(`round ${roundNumber}`)
  ) {
    return name;
  }
  return `R${roundNumber} - ${name}`;
}

function interviewRoundToneClass(color: string): string {
  switch (color) {
    case "green":
      return "border-emerald-300 bg-emerald-50";
    case "blue":
      return "border-blue-300 bg-blue-50";
    case "yellow":
      return "border-amber-300 bg-amber-50";
    case "red":
      return "border-red-300 bg-red-50";
    case "orange":
      return "border-orange-300 bg-orange-50";
    case "grey":
    default:
      return "border-slate-300 bg-slate-50";
  }
}

function experienceLabel(row: RequisitionWorkspaceCandidateRow): string {
  const y = row.experience.years;
  const cie = row.experience.cie_level?.trim();
  if (y != null && Number.isFinite(y)) {
    return cie ? `${y} yrs · ${cie}` : `${y} yrs`;
  }
  return cie || "—";
}

function stageBadgeClass(row: RequisitionWorkspaceCandidateRow): string {
  if (row.lifecycle.is_rejected) {
    return "bg-red-100 text-red-900 ring-1 ring-red-200";
  }
  switch (row.current_stage) {
    case "Hired":
      return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200";
    case "Offered":
      return "bg-violet-100 text-violet-900 ring-1 ring-violet-200";
    case "Interviewing":
      return "bg-blue-100 text-blue-900 ring-1 ring-blue-200";
    case "Shortlisted":
      return "bg-amber-100 text-amber-900 ring-1 ring-amber-200";
    case "Rejected":
      return "bg-red-100 text-red-900 ring-1 ring-red-200";
    default:
      return "bg-slate-100 text-slate-800 ring-1 ring-slate-200";
  }
}

function lifecycleStepClass(
  state: "not_started" | "current" | "past" | "rejected",
): string {
  switch (state) {
    case "past":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "current":
      return "border-blue-300 bg-blue-50 text-blue-700";
    case "rejected":
      return "border-red-300 bg-red-50 text-red-700";
    case "not_started":
    default:
      return "border-slate-300 bg-slate-50 text-slate-600";
  }
}

function listLifecycleDotClass(state: string): string {
  if (state === "past") return "border-emerald-400 bg-emerald-500";
  if (state === "current") return "border-blue-300 bg-blue-500";
  if (state === "rejected") return "border-red-300 bg-red-500";
  return "border-slate-300 bg-slate-500";
}

function listLifecycleLabelClass(state: string): string {
  if (state === "past") return "text-emerald-500";
  if (state === "current") return "text-blue-500";
  if (state === "rejected") return "text-red-500";
  return "text-slate-500";
}

function listLifecycleSegmentClass(rightState: string): string {
  if (rightState === "past") return "bg-emerald-500";
  if (rightState === "current") return "bg-blue-300";
  if (rightState === "rejected") return "bg-red-400";
  return "bg-slate-300";
}

function ListLifecycleTrack({
  stages,
}: {
  stages: Array<{ key: string; label: string; state: string }>;
}) {
  if (!stages.length) return null;
  return (
    <div className="pt-1">
      <div className="relative flex items-start justify-between gap-2">
        {stages.map((stage, idx) => (
          <div key={stage.key} className="relative flex min-w-0 flex-1 flex-col items-center">
            {idx > 0 ? (
              <div
                className={`absolute -left-1/2 top-[11px] h-[3px] w-full ${listLifecycleSegmentClass(stage.state)}`}
              />
            ) : null}
            <span
              className={`relative z-10 h-5 w-5 rounded-full border-2 ${listLifecycleDotClass(stage.state)}`}
            />
            <span
              className={`mt-1 text-center text-[11px] font-semibold uppercase tracking-wide ${listLifecycleLabelClass(stage.state)}`}
            >
              {stage.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type CandidateWorkspaceCardProps = {
  row: RequisitionWorkspaceCandidateRow;
  viewMode: ViewMode;
  returnTo: string;
  candidateBasePath: string;
  onOpenWorkspace: (
    candidateId: number,
    applicationId: number,
    workspace: "evaluate" | "execute",
  ) => void;
};

const CandidateWorkspaceCard = memo(function CandidateWorkspaceCard({
  row,
  viewMode,
  returnTo,
  candidateBasePath,
  onOpenWorkspace,
}: CandidateWorkspaceCardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const openProfile = useCallback(() => {
    const q = new URLSearchParams();
    q.set("application_id", String(row.application_id));
    if (returnTo) q.set("returnTo", returnTo);
    router.push(`${candidateBasePath}/${row.candidate_id}?${q.toString()}`);
  }, [router, row.application_id, row.candidate_id, returnTo, candidateBasePath]);

  const copyEmail = useCallback(() => {
    try {
      void navigator.clipboard.writeText(row.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      setCopied(false);
    }
  }, [row.email]);

  const isList = viewMode === "list";
  const rounds =
    row.lifecycle.top_level.find((s) => s.key === "Interviewing")?.rounds ?? [];

  return (
    <article className="h-full rounded-3xl border border-[var(--border-subtle)] shadow-sm transition-shadow duration-200 hover:shadow-md">
      {isList ? (
        <div className="space-y-2 bg-[var(--bg-primary)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {row.full_name}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stageBadgeClass(row)}`}
                >
                  {row.current_stage}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1 truncate">
                  <Mail size={12} className="shrink-0 opacity-70" />
                  {row.email}
                </span>
                {row.phone ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="opacity-70">☎</span> {row.phone}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="Open profile"
                onClick={openProfile}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              >
                <User size={14} />
              </button>
              <button
                type="button"
                title="Evaluate"
                onClick={() =>
                  onOpenWorkspace(row.candidate_id, row.application_id, "evaluate")
                }
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              >
                <Search size={14} />
              </button>
              <button
                type="button"
                title="Workspace (execute)"
                onClick={() =>
                  onOpenWorkspace(row.candidate_id, row.application_id, "execute")
                }
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              >
                <Wrench size={14} />
              </button>
              <button
                type="button"
                title={copied ? "Copied" : "Copy email"}
                onClick={copyEmail}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              >
                <Clipboard size={14} className={copied ? "text-emerald-700" : ""} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-tertiary)]">
            <span>Applied {formatShortDate(row.created_at)}</span>
            <span>Source: {row.source}</span>
            <span>Exp: {experienceLabel(row)}</span>
            {row.role_label ? <span>Line: {row.role_label}</span> : null}
            <span>
              Recruiter:{" "}
              {row.recruiter?.name?.trim() ? row.recruiter.name : "—"}
            </span>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
            <ListLifecycleTrack stages={row.lifecycle.top_level} />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              Interview Rounds
            </div>
            {rounds.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
                No rounds scheduled yet.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rounds.slice(0, 6).map((round) => (
                  <div
                    key={round.interview_id}
                    className={`min-h-[78px] w-[140px] shrink-0 rounded-md border px-2 py-1.5 ${interviewRoundToneClass(round.color)}`}
                  >
                    <div className="truncate text-[10px] font-semibold uppercase text-slate-600">
                      {interviewRoundTitle(round.round_number, round.round_name)}
                    </div>
                    <div className="truncate text-[11px] font-semibold text-slate-800">
                      {round.round_type || "General"}
                    </div>
                    <div className="truncate text-[11px] font-semibold text-slate-800">
                      {interviewRoundStatusLabel(round.status, round.result)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {round.scheduled_at
                        ? `On ${formatShortDate(round.scheduled_at)}`
                        : "Date TBD"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-0 bg-white text-slate-900 md:grid-cols-[minmax(0,1fr)_150px]">
          <div className="flex min-w-0 flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-lg font-semibold leading-tight text-slate-900">
                    {row.full_name}
                  </h3>
                  <span className="rounded-full border border-blue-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                    {row.current_stage}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-600">
                  <span className="inline-flex items-center gap-1 truncate">
                    <Mail size={12} className="shrink-0 opacity-70" />
                    {row.email}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="opacity-70">☎</span>
                    {row.phone || "—"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                  <span>Applied {formatShortDate(row.created_at)}</span>
                  <span>Source: {row.source}</span>
                  <span>Exp: {experienceLabel(row)}</span>
                  {row.role_label ? <span>Applied For: {row.role_label}</span> : null}
                  <span>
                    Recruiter: {row.recruiter?.name?.trim() ? row.recruiter.name : "—"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-1 text-slate-700 shadow-sm">
                <button
                  type="button"
                  title="Open profile"
                  onClick={openProfile}
                  className="rounded p-1.5 hover:bg-slate-100"
                >
                  <User size={14} />
                </button>
                <button
                  type="button"
                  title="Evaluate"
                  onClick={() =>
                    onOpenWorkspace(row.candidate_id, row.application_id, "evaluate")
                  }
                  className="rounded p-1.5 hover:bg-slate-100"
                >
                  <Search size={14} />
                </button>
                <button
                  type="button"
                  title="Workspace (execute)"
                  onClick={() =>
                    onOpenWorkspace(row.candidate_id, row.application_id, "execute")
                  }
                  className="rounded p-1.5 hover:bg-slate-100"
                >
                  <Wrench size={14} />
                </button>
                <button
                  type="button"
                  title={copied ? "Copied" : "Copy email"}
                  onClick={copyEmail}
                  className="rounded p-1.5 hover:bg-slate-100"
                >
                  <Clipboard size={14} />
                </button>
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Interview Rounds
              </div>
              {rounds.length === 0 ? (
                <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No rounds scheduled yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-3">
                  {rounds.slice(0, 6).map((round) => (
                    <div
                      key={round.interview_id}
                      className={`min-h-[78px] min-w-0 rounded-md border px-2 py-1 ${interviewRoundToneClass(round.color)}`}
                    >
                      <div className="truncate text-[10px] font-semibold uppercase text-slate-600">
                        {interviewRoundTitle(round.round_number, round.round_name)}
                      </div>
                      <div className="truncate text-[10px] font-semibold leading-tight text-slate-800">
                        {round.round_type || "General"}
                      </div>
                      <div className="truncate text-[10px] font-semibold leading-tight text-slate-800">
                        {interviewRoundStatusLabel(round.status, round.result)}
                      </div>
                      <div className="truncate text-[9px] text-slate-500">
                        {round.scheduled_at
                          ? `On ${formatShortDate(round.scheduled_at)}`
                          : "Date TBD"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-l border-slate-300 p-2.5">
            <div className="mb-2 text-xs font-semibold text-slate-700">
              Interview Lifecycle
            </div>
            <div className="space-y-1.5">
              {row.lifecycle.top_level.map((stage, idx) => (
                <div key={stage.key} className="text-center">
                  <div
                    className={`rounded-xl border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${lifecycleStepClass(stage.state)}`}
                  >
                    {stage.label}
                  </div>
                  {idx < row.lifecycle.top_level.length - 1 ? (
                    <div className="py-0.5 text-base leading-none text-slate-400">›</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
});

export interface CandidatesWorkspaceTabPanelProps {
  requisitionId: number;
  ticket: TicketData;
  candidateBasePath?: string;
}

export function CandidatesWorkspaceTabPanel({
  requisitionId,
  ticket,
  candidateBasePath = "/ta/candidates",
}: CandidatesWorkspaceTabPanelProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    const v = window.localStorage.getItem(VIEW_MODE_KEY);
    return v === "list" ? "list" : "grid";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [itemFilter, setItemFilter] = useState<string>("all");
  const [stage, setStage] = useState("");
  const [source, setSource] = useState("");
  const [interviewStatus, setInterviewStatus] = useState("any");
  const [recruiterId, setRecruiterId] = useState<string>("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [expMin, setExpMin] = useState("");
  const [expMax, setExpMax] = useState("");
  const [includeUnknownExp, setIncludeUnknownExp] = useState(false);
  const setGridView = useCallback(() => setViewMode("grid"), []);
  const setListView = useCallback(() => setViewMode("list"), []);

  const itemOptions = useMemo(
    () =>
      (ticket.items ?? []).map((i) => ({
        value: String(i.numericItemId),
        label: `${i.skill} (#${i.numericItemId})`,
      })),
    [ticket.items],
  );

  const queryParams = useMemo(() => {
    const itemNum =
      itemFilter !== "all" ? Number.parseInt(itemFilter, 10) : Number.NaN;
    const recNum =
      recruiterId !== "" ? Number.parseInt(recruiterId, 10) : Number.NaN;
    const expMinN = expMin !== "" ? Number.parseFloat(expMin) : Number.NaN;
    const expMaxN = expMax !== "" ? Number.parseFloat(expMax) : Number.NaN;
    return {
      page,
      limit: pageSize,
      q: debouncedQ || undefined,
      requisition_item_id: Number.isFinite(itemNum) ? itemNum : undefined,
      current_stage: stage || undefined,
      source: source || undefined,
      created_by: Number.isFinite(recNum) ? recNum : undefined,
      applied_from: appliedFrom || undefined,
      applied_to: appliedTo || undefined,
      exp_min: Number.isFinite(expMinN) ? expMinN : undefined,
      exp_max: Number.isFinite(expMaxN) ? expMaxN : undefined,
      include_unknown_exp: includeUnknownExp || undefined,
      interview_status: interviewStatus !== "any" ? interviewStatus : undefined,
    };
  }, [
    page,
    pageSize,
    debouncedQ,
    itemFilter,
    stage,
    source,
    recruiterId,
    appliedFrom,
    appliedTo,
    expMin,
    expMax,
    includeUnknownExp,
    interviewStatus,
  ]);

  const validationError = useMemo(() => {
    const expMinN = expMin !== "" ? Number.parseFloat(expMin) : null;
    const expMaxN = expMax !== "" ? Number.parseFloat(expMax) : null;
    if (
      expMinN != null &&
      expMaxN != null &&
      Number.isFinite(expMinN) &&
      Number.isFinite(expMaxN) &&
      expMinN > expMaxN
    ) {
      return "Experience min cannot be greater than max.";
    }
    if (appliedFrom && !isValidYyyyMmDd(appliedFrom)) {
      return "Applied from date must be valid.";
    }
    if (appliedTo && !isValidYyyyMmDd(appliedTo)) {
      return "Applied to date must be valid.";
    }
    if (appliedFrom && appliedTo) {
      try {
        const a = new Date(`${appliedFrom}T00:00:00.000Z`).getTime();
        const b = new Date(`${appliedTo}T00:00:00.000Z`).getTime();
        if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
          return "Applied from cannot be after applied to.";
        }
      } catch {
        // ignore
      }
    }
    return null;
  }, [appliedFrom, appliedTo, expMin, expMax]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: qk.requisition.candidatesWorkspace(requisitionId, queryParams),
    queryFn: ({ signal }) =>
      fetchRequisitionCandidatesWorkspace(requisitionId, { ...queryParams, signal }),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    enabled: validationError == null,
  });

  // Server clamps page above totalPages and returns the corrected meta;
  // resync local page when that happens.
  useEffect(() => {
    if (
      data?.pagination &&
      data.pagination.totalPages > 0 &&
      data.pagination.page !== page
    ) {
      setPage(data.pagination.page);
    }
  }, [data?.pagination, page]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedQ,
    itemFilter,
    stage,
    source,
    interviewStatus,
    recruiterId,
    appliedFrom,
    appliedTo,
    expMin,
    expMax,
    includeUnknownExp,
    pageSize,
  ]);

  const resetFilters = useCallback(() => {
    setSearchInput("");
    setDebouncedQ("");
    setItemFilter("all");
    setStage("");
    setSource("");
    setInterviewStatus("any");
    setRecruiterId("");
    setAppliedFrom("");
    setAppliedTo("");
    setExpMin("");
    setExpMax("");
    setIncludeUnknownExp(false);
    setShowMoreFilters(false);
    setPage(1);
  }, []);

  const onOpenWorkspace = useCallback(
    (
      candidateId: number,
      applicationId: number,
      workspace: "evaluate" | "execute",
    ) => {
      const q = new URLSearchParams();
      q.set("application_id", String(applicationId));
      q.set("workspace", workspace);
      if (pathname) q.set("returnTo", pathname);
      router.push(`${candidateBasePath}/${candidateId}?${q.toString()}`);
    },
    [router, pathname, candidateBasePath],
  );

  const stages = data?.facets.stages ?? [];
  const sources = data?.facets.sources ?? [];
  const recruiters = data?.facets.recruiters ?? [];

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        debouncedQ ||
          (itemFilter !== "all" && itemFilter !== "") ||
          stage ||
          source ||
          interviewStatus !== "any" ||
          recruiterId ||
          appliedFrom ||
          appliedTo ||
          expMin ||
          expMax ||
          includeUnknownExp,
      ),
    [
      debouncedQ,
      itemFilter,
      stage,
      source,
      interviewStatus,
      recruiterId,
      appliedFrom,
      appliedTo,
      expMin,
      expMax,
      includeUnknownExp,
    ],
  );

  return (
    <div className="px-2 pb-6 md:px-4">
      <div className="sticky top-0 z-20 -mx-2 mb-4 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/95 px-2 py-3 backdrop-blur md:-mx-4 md:px-4">
        <div className="flex flex-wrap items-end gap-2 gap-y-2">
          {/* Search */}
          <label className="flex min-w-[160px] flex-1 flex-col gap-0.5 text-[11px] text-[var(--text-tertiary)]">
            Search
            <span className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Name, email, phone"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] py-1.5 pl-7 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setDebouncedQ("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </span>
          </label>

          {/* Line */}
          <label className="flex min-w-[120px] flex-col gap-0.5 text-[11px] text-[var(--text-tertiary)]">
            Line
            <select
              value={itemFilter}
              onChange={(e) => setItemFilter(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="all">All lines</option>
              {itemOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {/* Stage */}
          <label className="flex min-w-[120px] flex-col gap-0.5 text-[11px] text-[var(--text-tertiary)]">
            Stage
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="">Any stage</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {/* Interview */}
          <label className="flex min-w-[140px] flex-col gap-0.5 text-[11px] text-[var(--text-tertiary)]">
            Interview
            <select
              value={interviewStatus}
              onChange={(e) => setInterviewStatus(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {WORKSPACE_INTERVIEW_STATUS.map((k) => (
                <option key={k} value={k}>
                  {INTERVIEW_STATUS_LABELS[k] ?? k}
                </option>
              ))}
            </select>
          </label>

          {/* Toggle more filters */}
          <button
            type="button"
            onClick={() => setShowMoreFilters((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            {showMoreFilters ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
            More filters
          </button>

          {/* Extra filters */}
          {showMoreFilters && (
            <>
              {/* Source */}
              <label className="flex min-w-[110px] flex-col gap-0.5 text-[11px] text-[var(--text-tertiary)]">
                Source
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">Any source</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              {/* Recruiter */}
              <label className="flex min-w-[120px] flex-col gap-0.5 text-[11px] text-[var(--text-tertiary)]">
                Recruiter
                <select
                  value={recruiterId}
                  onChange={(e) => setRecruiterId(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">Any</option>
                  {recruiters.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Applied from */}
              <label className="flex w-[130px] flex-col gap-0.5 text-[11px] text-[var(--text-tertiary)]">
                Applied from
                <input
                  type="date"
                  value={appliedFrom}
                  onChange={(e) => setAppliedFrom(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </label>

              {/* Applied to */}
              <label className="flex w-[130px] flex-col gap-0.5 text-[11px] text-[var(--text-tertiary)]">
                Applied to
                <input
                  type="date"
                  value={appliedTo}
                  onChange={(e) => setAppliedTo(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </label>

              {/* Exp min */}
              <label className="flex w-[72px] flex-col gap-0.5 text-[11px] text-[var(--text-tertiary)]">
                Exp min
                <input
                  value={expMin}
                  onChange={(e) => setExpMin(e.target.value)}
                  inputMode="decimal"
                  placeholder="yrs"
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </label>

              {/* Exp max */}
              <label className="flex w-[72px] flex-col gap-0.5 text-[11px] text-[var(--text-tertiary)]">
                Exp max
                <input
                  value={expMax}
                  onChange={(e) => setExpMax(e.target.value)}
                  inputMode="decimal"
                  placeholder="yrs"
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </label>

              {/* Unknown exp */}
              <label className="flex cursor-pointer items-center gap-2 pt-5 text-[11px] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={includeUnknownExp}
                  onChange={(e) => setIncludeUnknownExp(e.target.checked)}
                />
                Unknown exp.
              </label>
            </>
          )}

          {/* Controls (always visible) */}
          <div className="ml-auto flex flex-wrap items-center gap-2 pt-4">
            <button
              type="button"
              title="Grid view"
              aria-pressed={viewMode === "grid"}
              onClick={setGridView}
              className={
                viewMode === "grid"
                  ? "rounded-lg border border-blue-600 bg-blue-50 p-2 text-blue-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  : "rounded-lg border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              }
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              title="List view"
              aria-pressed={viewMode === "list"}
              onClick={setListView}
              className={
                viewMode === "list"
                  ? "rounded-lg border border-blue-600 bg-blue-50 p-2 text-blue-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  : "rounded-lg border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              }
            >
              <List size={16} />
            </button>
            <span className="text-xs text-[var(--text-tertiary)]">
              View: {viewMode === "grid" ? "Grid" : "List"}
            </span>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={validationError != null}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={isFetching ? "animate-spin" : ""}
              />
              Refresh
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-[var(--border-subtle)] px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            >
              Reset filters
            </button>
          </div>
        </div>

        {validationError && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {validationError}
          </div>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error instanceof Error
            ? error.message
            : "Failed to load candidates."}
        </div>
      )}

      {/* Loading state */}
      {isLoading && !data ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-tertiary)]">
          <RefreshCw size={16} className="animate-spin" />
          Loading candidates…
        </div>
      ) : data && data.pagination.total === 0 && !hasActiveFilters ? (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-6 py-12 text-center">
          <Clipboard
            size={24}
            className="mx-auto mb-2 text-[var(--text-tertiary)]"
          />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            No applications on this requisition yet.
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            When candidates apply to any line on this requisition, they will
            appear here.
          </p>
        </div>
      ) : data && data.pagination.total === 0 && hasActiveFilters ? (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <SearchX
            size={24}
            className="mx-auto mb-2 text-amber-600"
          />
          <p className="text-sm font-medium text-amber-950">
            No candidates match your filters.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-3 text-xs font-semibold text-blue-700 underline"
          >
            Clear filters
          </button>
        </div>
      ) : data ? (
        <>
          {viewMode === "list" && data.items.length > VIRTUALIZE_LIST_THRESHOLD ? (
            <VirtualList
              items={data.items}
              estimateSize={260}
              height={800}
              overscan={4}
              getItemKey={(row) => row.application_id}
              renderItem={(row) => (
                <div className="pb-3">
                  <CandidateWorkspaceCard
                    row={row}
                    viewMode="list"
                    returnTo={pathname}
                    candidateBasePath={candidateBasePath}
                    onOpenWorkspace={onOpenWorkspace}
                  />
                </div>
              )}
            />
          ) : (
            <div
              key={viewMode}
              className={
                viewMode === "grid"
                  ? // Arbitrary columns: hr-dashboard.css redefines `.grid-cols-*` later and defeats `sm:grid-cols-2`.
                    "grid gap-4 [grid-template-columns:repeat(2,minmax(0,1fr))] max-sm:[grid-template-columns:repeat(1,minmax(0,1fr))]"
                  : "flex flex-col space-y-3"
              }
            >
              {data.items.map((row) => (
                <CandidateWorkspaceCard
                  key={row.application_id}
                  row={row}
                  viewMode={viewMode}
                  returnTo={pathname}
                  candidateBasePath={candidateBasePath}
                  onOpenWorkspace={onOpenWorkspace}
                />
              ))}
            </div>
          )}

          <ListFooter
            pagination={data.pagination}
            onPageChange={setPage}
            onPageSizeChange={(n: PageSize) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
