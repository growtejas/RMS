"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Eye, RefreshCw, Search } from "lucide-react";

import {
  useManagerRequisitionList,
} from "@/hooks/manager/useManagerRequisitionList";

const PAGE_SIZE = 12;
type SortValue =
  | "created_desc"
  | "created_asc"
  | "required_desc"
  | "required_asc"
  | "budget_desc"
  | "budget_asc";
type StatusValue = "all" | "pending" | "in_progress" | "closed" | "draft";
type PriorityValue = "all" | "high" | "medium" | "low";

const SORT_OPTIONS: Array<{ label: string; value: SortValue }> = [
  { label: "Newest created", value: "created_desc" },
  { label: "Oldest created", value: "created_asc" },
  { label: "Required date (soonest)", value: "required_asc" },
  { label: "Required date (latest)", value: "required_desc" },
  { label: "Budget (high to low)", value: "budget_desc" },
  { label: "Budget (low to high)", value: "budget_asc" },
];

const statusLabels: Record<StatusValue, string> = {
  all: "All statuses",
  pending: "Pending",
  in_progress: "In Progress",
  closed: "Closed",
  draft: "Draft",
};

const priorityLabels: Record<PriorityValue, string> = {
  all: "All priorities",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const getStatusBucket = (status: string): Exclude<StatusValue, "all"> => {
  const normalized = status.toLowerCase();
  if (normalized.includes("draft")) return "draft";
  if (
    normalized.includes("fulfilled") ||
    normalized.includes("closed") ||
    normalized.includes("cancel") ||
    normalized.includes("reject")
  ) {
    return "closed";
  }
  if (
    normalized.includes("pending") ||
    normalized.includes("approval") ||
    normalized.includes("awaiting")
  ) {
    return "pending";
  }
  return "in_progress";
};

const parsePriority = (priority: string): Exclude<PriorityValue, "all"> => {
  const normalized = priority.toLowerCase();
  if (normalized.includes("high") || normalized.includes("critical")) {
    return "high";
  }
  if (normalized.includes("low")) {
    return "low";
  }
  return "medium";
};

const MyRequisitions: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { requisitions, isLoading, error, reload } = useManagerRequisitionList();

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusValue>(() => {
    const value = searchParams.get("status");
    if (value === "pending" || value === "in_progress" || value === "closed" || value === "draft") {
      return value;
    }
    return "all";
  });
  const [priorityFilter, setPriorityFilter] = useState<PriorityValue>(() => {
    const value = searchParams.get("priority");
    if (value === "high" || value === "medium" || value === "low") {
      return value;
    }
    return "all";
  });
  const [sortBy, setSortBy] = useState<SortValue>(() => {
    const value = searchParams.get("sort");
    if (
      value === "created_desc" ||
      value === "created_asc" ||
      value === "required_desc" ||
      value === "required_asc" ||
      value === "budget_desc" ||
      value === "budget_asc"
    ) {
      return value;
    }
    return "created_desc";
  });
  const [page, setPage] = useState(() => {
    const value = Number.parseInt(searchParams.get("page") ?? "1", 10);
    return Number.isFinite(value) && value > 0 ? value : 1;
  });

  const setQueryParams = (next: {
    q?: string;
    status?: StatusValue;
    priority?: PriorityValue;
    sort?: SortValue;
    page?: number;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q !== undefined) {
      if (next.q) {
        params.set("q", next.q);
      } else {
        params.delete("q");
      }
    }
    if (next.status !== undefined) {
      if (next.status === "all") {
        params.delete("status");
      } else {
        params.set("status", next.status);
      }
    }
    if (next.priority !== undefined) {
      if (next.priority === "all") {
        params.delete("priority");
      } else {
        params.set("priority", next.priority);
      }
    }
    if (next.sort !== undefined) {
      if (next.sort === "created_desc") {
        params.delete("sort");
      } else {
        params.set("sort", next.sort);
      }
    }
    if (next.page !== undefined) {
      if (next.page <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(next.page));
      }
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStatusBadgeClass = (status: string) => {
    if (
      status === "Pending Budget Approval" ||
      status === "Pending HR Approval"
    ) {
      return "status-badge inactive";
    }
    if (status === "Approved & Unassigned" || status === "In-Progress") {
      return "status-badge active";
    }
    return `status-badge ${status.toLowerCase().replace(/\s+/g, "-")}`;
  };
  const kpis = useMemo(() => {
    const totalBudget = requisitions.reduce(
      (sum, req) => sum + (req.effective_budget ?? 0),
      0,
    );
    const pending = requisitions.filter(
      (req) => getStatusBucket(req.overall_status) === "pending",
    ).length;
    const inProgress = requisitions.filter(
      (req) => getStatusBucket(req.overall_status) === "in_progress",
    ).length;
    const atRisk = requisitions.filter((req) => {
      if (!req.required_by_date) return false;
      const days =
        (new Date(req.required_by_date).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24);
      return days <= 7 && days >= 0 && getStatusBucket(req.overall_status) !== "closed";
    }).length;
    return { totalBudget, pending, inProgress, atRisk };
  }, [requisitions]);

  const filteredAndSorted = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = requisitions.filter((req) => {
      const status = getStatusBucket(req.overall_status);
      const priority = parsePriority(req.priority || "");

      const matchesStatus = statusFilter === "all" || statusFilter === status;
      const matchesPriority =
        priorityFilter === "all" || priorityFilter === priority;
      const haystack = [
        `REQ-${req.req_id}`,
        req.project_name,
        req.client_name ?? "",
        req.overall_status,
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);

      return matchesStatus && matchesPriority && matchesQuery;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const time = (v: string | null | undefined) => {
        if (!v) return 0;
        const t = new Date(v).getTime();
        return Number.isFinite(t) ? t : 0;
      };
      switch (sortBy) {
        case "created_asc":
          return time(a.created_at) - time(b.created_at);
        case "created_desc":
          return time(b.created_at) - time(a.created_at);
        case "required_asc":
          return (
            time(a.required_by_date) -
            time(b.required_by_date)
          );
        case "required_desc":
          return (
            time(b.required_by_date) -
            time(a.required_by_date)
          );
        case "budget_asc":
          return (a.effective_budget ?? 0) - (b.effective_budget ?? 0);
        case "budget_desc":
          return (b.effective_budget ?? 0) - (a.effective_budget ?? 0);
        default:
          return 0;
      }
    });

    return sorted;
  }, [priorityFilter, query, requisitions, sortBy, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredAndSorted.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
      setQueryParams({ page: pageCount });
    }
  }, [page, pageCount]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="manager-header">
          <h2>My Requisitions</h2>
          <p className="subtitle">
            Track progress, identify bottlenecks, and drill into requisition details.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
            <div className="text-xs text-slate-500">Total Requisitions</div>
            <div className="text-2xl font-semibold text-slate-900">
              {requisitions.length}
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 p-4 bg-amber-50">
            <div className="text-xs text-amber-700">Pending Approvals</div>
            <div className="text-2xl font-semibold text-amber-900">{kpis.pending}</div>
          </div>
          <div className="rounded-lg border border-blue-200 p-4 bg-blue-50">
            <div className="text-xs text-blue-700">In Progress</div>
            <div className="text-2xl font-semibold text-blue-900">{kpis.inProgress}</div>
          </div>
          <div className="rounded-lg border border-rose-200 p-4 bg-rose-50">
            <div className="text-xs text-rose-700">At Risk (next 7 days)</div>
            <div className="text-2xl font-semibold text-rose-900">{kpis.atRisk}</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Total requested budget:{" "}
          <span className="font-medium text-slate-700">{formatCurrency(kpis.totalBudget)}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Search</label>
            <div className="mt-1 flex items-center rounded-lg border border-slate-200 px-3">
              <Search size={16} className="text-slate-400" />
              <input
                value={query}
                onChange={(e) => {
                  const next = e.target.value;
                  setQuery(next);
                  setPage(1);
                  setQueryParams({ q: next, page: 1 });
                }}
                placeholder="REQ ID, project, client, status"
                className="w-full border-0 outline-none bg-transparent px-2 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  const next = e.target.value as StatusValue;
                  setStatusFilter(next);
                  setPage(1);
                  setQueryParams({ status: next, page: 1 });
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  const next = e.target.value as PriorityValue;
                  setPriorityFilter(next);
                  setPage(1);
                  setQueryParams({ priority: next, page: 1 });
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Sort</label>
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const next = e.target.value as SortValue;
                    setSortBy(next);
                    setPage(1);
                    setQueryParams({ sort: next, page: 1 });
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="action-button text-sm"
                  onClick={() => {
                    void reload();
                  }}
                  title="Refresh"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Showing {filteredAndSorted.length} of {requisitions.length} requisitions
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="data-table-container">
          <table className="data-table">
          <thead>
            <tr>
              <th>Req ID</th>
              <th>Project</th>
              <th>Client</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Required By</th>
              <th>Budget</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">Loading requisitions…</div>
                </td>
              </tr>
            )}

            {!isLoading && error && (
              <tr>
                <td colSpan={9}>
                  <div
                    className="empty-state"
                    style={{ color: "var(--error)" }}
                  >
                    {error}
                  </div>
                </td>
              </tr>
            )}

            {!isLoading && !error && requisitions.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">No requisitions found.</div>
                </td>
              </tr>
            )}

            {!isLoading &&
              !error &&
              filteredAndSorted.length === 0 &&
              requisitions.length > 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      No requisitions match the selected filters.
                    </div>
                  </td>
                </tr>
              )}

            {!isLoading &&
              !error &&
              pageRows.map((req) => (
                <tr key={req.req_id}>
                  <td>
                    <strong>REQ-{req.req_id}</strong>
                  </td>
                  <td>{req.project_name || "—"}</td>
                  <td>{req.client_name || "—"}</td>
                  <td>
                    <span className={getStatusBadgeClass(req.overall_status)}>
                      {req.overall_status}
                    </span>
                  </td>
                  <td>{req.priority || "—"}</td>
                  <td>{formatDate(req.required_by_date)}</td>
                  <td>{formatCurrency(req.effective_budget ?? null)}</td>
                  <td>{formatDate(req.created_at)}</td>
                  <td>
                    <button
                      className="action-button text-sm"
                      onClick={() =>
                        router.push(`/manager/requisitions/${req.req_id}`)
                      }
                    >
                      <Eye size={14} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

        {!isLoading && !error && filteredAndSorted.length > 0 && (
          <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="text-xs text-slate-500">
              Page {currentPage} of {pageCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="action-button text-sm"
                disabled={currentPage <= 1}
                onClick={() => {
                  const next = currentPage - 1;
                  setPage(next);
                  setQueryParams({ page: next });
                }}
              >
                Previous
              </button>
              <button
                type="button"
                className="action-button text-sm"
                disabled={currentPage >= pageCount}
                onClick={() => {
                  const next = currentPage + 1;
                  setPage(next);
                  setQueryParams({ page: next });
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {kpis.atRisk > 0 && !isLoading && (
          <div className="mt-4 text-xs text-rose-700 flex items-center gap-1">
            <AlertTriangle size={14} />
            {kpis.atRisk} requisition{kpis.atRisk > 1 ? "s are" : " is"} due
            within 7 days. Review required-by dates and bottlenecks.
          </div>
        )}

        <div className="mt-4 text-xs text-slate-500">
          This view is read-only. Item status, assignments, and closure are handled by HR/TA workflows.
        </div>
      </div>
    </div>
  );
};

export default MyRequisitions;
