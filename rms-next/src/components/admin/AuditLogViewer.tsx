"use client";

// Migrated from legacy Vite SPA.
import React, { useMemo, useState, useEffect } from "react";
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

import { apiClient } from "@/lib/api/client";
import { cachedApiGet } from "@/lib/api/cached-api-get";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";

interface AuditLog {
  id: number;
  timestamp: string;
  dateLabel: string;
  timeLabel: string;
  userId?: number | null;
  user: string;
  userFullName?: string;
  userRoles?: string[];
  targetUserName?: string;
  targetUserFullName?: string;
  action: string;
  entityType: "employee" | "requisition" | "user" | "role" | "system";
  entityId: number;
  entityName: string;
  oldValue: string;
  newValue: string;
}

type AuditLogResponse = {
  audit_id: number;
  entity_name: string;
  entity_id: string | null;
  action: string;
  performed_by: number | null;
  performed_at: string;
  performed_by_username?: string | null;
  performed_by_full_name?: string | null;
  performed_by_roles?: string[];
  target_user_id?: number | null;
  target_user_username?: string | null;
  target_user_full_name?: string | null;
};

type AuditSummaryResponse = {
  total_logs: number;
  warnings_errors: number;
  active_users: number;
  failed_logins: number;
};

const normalizeAudit = (log: AuditLogResponse): AuditLog => {
  const roles = log.performed_by_roles;
  const userRoles = Array.isArray(roles)
    ? roles
    : roles != null
      ? [String(roles)]
      : undefined;
  const entityIdNum = log.entity_id != null ? Number(log.entity_id) : NaN;
  const ts = log.performed_at || new Date(0).toISOString();
  const d = new Date(ts);
  const dateLabel = Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  const timeLabel = Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString();
  return {
    id: log.audit_id,
    timestamp: ts,
    dateLabel,
    timeLabel,
    userId: log.performed_by ?? null,
    user: log.performed_by_username || log.performed_by?.toString() || "System",
    userFullName: log.performed_by_full_name || undefined,
    userRoles,
    targetUserName: log.target_user_username || undefined,
    targetUserFullName: log.target_user_full_name || undefined,
    action: log.action ?? "UNKNOWN",
    entityType: "system",
    entityId: Number.isFinite(entityIdNum) ? entityIdNum : 0,
    entityName: log.entity_name != null ? String(log.entity_name) : "—",
    oldValue: "",
    newValue: "",
  };
};

const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [summary, setSummary] = useState<AuditSummaryResponse>({
    total_logs: 0,
    warnings_errors: 0,
    active_users: 0,
    failed_logins: 0,
  });
  const [filters, setFilters] = useState({
    search: "",
    dateFrom: "",
    dateTo: "",
    user: "",
    action: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 50;

  const userOptions = useMemo(() => {
    const m = new Map<string, { value: string; label: string }>();
    for (const log of logs) {
      const name = log.userFullName || log.user;
      const roles = log.userRoles?.length ? log.userRoles.join(", ") : "-";
      const label = `${name} (${roles})`;
      const value =
        log.userId !== null && log.userId !== undefined
          ? log.userId.toString()
          : "system";
      if (!m.has(value)) {
        m.set(value, { value, label });
      }
    }
    return Array.from(m.values());
  }, [logs]);

  const actionOptions = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.action))).sort();
  }, [logs]);

  // Reset paging when filters or data change
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filters.dateFrom,
    filters.dateTo,
    filters.user,
    filters.action,
  ]);

  const fetchSummary = async () => {
    try {
      const body = await cachedApiGet<AuditSummaryResponse>(
        "/audit-logs/summary",
        {
          cacheTtlMs: 10_000,
          params: {
            search: debouncedSearch || undefined,
            date_from: filters.dateFrom || undefined,
            date_to: filters.dateTo || undefined,
            user_id: filters.user || undefined,
            action: filters.action || undefined,
          },
        },
      );
      if (body && typeof body === "object") {
        setSummary({
          total_logs: Number(body.total_logs) || 0,
          warnings_errors: Number(body.warnings_errors) || 0,
          active_users: Number(body.active_users) || 0,
          failed_logins: Number(body.failed_logins) || 0,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load audit summary";
      setError(message);
    }
  };

  const fetchLogs = async (opts?: { page?: number; append?: boolean }) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const pageToFetch = opts?.page ?? 1;
      const data = await cachedApiGet<
        AuditLogResponse[] | { logs: AuditLogResponse[] }
      >("/audit-logs/", {
        cacheTtlMs: 10_000,
        params: {
          search: debouncedSearch || undefined,
          date_from: filters.dateFrom || undefined,
          date_to: filters.dateTo || undefined,
          user_id: filters.user || undefined,
          action: filters.action || undefined,
          page: pageToFetch,
          page_size: pageSize,
        },
      });
      const raw = Array.isArray(data)
        ? data
        : data != null &&
            typeof data === "object" &&
            Array.isArray((data as { logs?: unknown }).logs)
          ? (data as { logs: AuditLogResponse[] }).logs
          : [];
      const mapped = raw.map(normalizeAudit);
      setHasMore(mapped.length === pageSize);
      setPage(pageToFetch);
      setLogs((prev) => (opts?.append ? [...prev, ...mapped] : mapped));
      await fetchSummary();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load audit logs";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [filters.search]);

  useEffect(() => {
    void fetchLogs({ page: 1, append: false });
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps -- load + debounced refetch

  const applyFilters = () => {
    fetchLogs({ page: 1, append: false });
  };

  const resetFilters = () => {
    setFilters({
      search: "",
      dateFrom: "",
      dateTo: "",
      user: "",
      action: "",
    });
    setDebouncedSearch("");
    fetchLogs({ page: 1, append: false });
  };

  const handleRefresh = () => {
    fetchLogs({ page: 1, append: false });
  };

  const handleLoadMore = () => {
    if (isLoading || !hasMore) return;
    fetchLogs({ page: page + 1, append: true });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await apiClient.get("/audit-logs/export", {
        params: {
          date_from: filters.dateFrom || undefined,
          date_to: filters.dateTo || undefined,
        },
        responseType: "blob",
      });

      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      const contentDisposition = response.headers["content-disposition"] as
        | string
        | undefined;
      const match = contentDisposition?.match(/filename=([^;]+)/i);
      const filename = match?.[1]?.replace(/"/g, "") || "audit-log.pdf";

      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      setSuccess("Audit log export downloaded successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to export audit logs";
      setError(message);
    } finally {
      setIsExporting(false);
    }
  };

  const formatDetails = (log: AuditLog) => {
    const targetName =
      log.targetUserFullName || log.targetUserName || "the user";

    if (log.action === "USER_VIEW") {
      return "Viewed user list";
    }

    if (log.action === "USER_ROLE_UPDATE") {
      return `Assigned role changes to user ${targetName}`;
    }

    if (log.action === "USER_DELETE") {
      return `Marked user ${targetName} as inactive`;
    }

    if (log.action === "USER_EDIT") {
      return `Updated user ${targetName}`;
    }

    return `${log.action} ${log.entityName}`.trim();
  };

  const auditActionBadge = (action: string): {
    label: string;
    variant: BadgeVariant;
  } => {
    switch ((action || "").toUpperCase()) {
      case "CREATE":
        return { label: "Created", variant: "success" };
      case "UPDATE":
        return { label: "Updated", variant: "warning" };
      case "DELETE":
        return { label: "Deleted", variant: "danger" };
      case "LOGIN":
        return { label: "Login", variant: "neutral" };
      case "LOGOUT":
        return { label: "Logout", variant: "neutral" };
      default:
        return { label: action?.trim() || "Unknown", variant: "neutral" };
    }
  };

  return (
    <div className="audit-log-viewer">
      <div className="viewer-header">
        <PageHeader
          title="Audit Log Review"
          subtitle="Write operations only: creates, updates, deletes, approvals, and workflow changes."
        />
        <div className="header-actions">
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw size={16} />
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download size={16} />
            {isExporting ? "Exporting..." : "Export Logs"}
          </Button>
        </div>
      </div>
      {success ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {success}
        </div>
      ) : null}

      {/* Filters */}
      <div className="log-filters">
        <div className="filter-group">
          <div className="search-box">
            <Search size={18} />
            <Input
              type="text"
              placeholder="Search logs..."
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </div>
        </div>

        <div className="filter-grid">
          <div className="filter-item">
            <label>From Date</label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters({ ...filters, dateFrom: e.target.value })
              }
            />
          </div>
          <div className="filter-item">
            <label>To Date</label>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters({ ...filters, dateTo: e.target.value })
              }
            />
          </div>
          <div className="filter-item">
            <label>User</label>
            <Select
              value={filters.user}
              onChange={(e) => setFilters({ ...filters, user: e.target.value })}
            >
              <option value="">All Users</option>
              {userOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="filter-item">
            <label>Action</label>
            <Select
              value={filters.action}
              onChange={(e) =>
                setFilters({ ...filters, action: e.target.value })
              }
            >
              <option value="">All Actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ),
              )}
            </Select>
          </div>
        </div>
        <div
          className="filter-actions"
          role="group"
          aria-label="Filter actions"
        >
          <Button className="apply-filters-button" onClick={applyFilters}>
            <Filter size={16} />
            Apply Filters
          </Button>
          <Button variant="secondary" className="apply-filters-button" onClick={resetFilters}>
            <RefreshCw size={16} />
            Reset Filters
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="log-stats">
        <div className="stat-card">
          <span className="stat-number">{summary.total_logs}</span>
          <span className="stat-label">Total Logs</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{summary.warnings_errors}</span>
          <span className="stat-label">Warnings & Errors</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{summary.active_users}</span>
          <span className="stat-label">Active Users</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{summary.failed_logins}</span>
          <span className="stat-label">Failed Logins</span>
        </div>
        {/* <div className="stat-card">
          <span className="stat-number">
            {logs.filter((l) => l.action === "LOGIN_FAILED").length}
          </span>
          <span className="stat-label">Failed Logins</span>
        </div> */}
      </div>

      {/* Log Table */}
      <div className="log-table-container">
        <Table className="border-0 shadow-none">
          <THead>
            <TR>
              <TH>Timestamp</TH>
              <TH>User</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Details</TH>
            </TR>
          </THead>
          <TBody>
            {isLoading && (
              <TR>
                <TD colSpan={5}>
                  <Loader label="Loading audit logs..." />
                </TD>
              </TR>
            )}
            {logs.map((log) => {
              const actionDisplay = auditActionBadge(log.action);
              return (
              <TR key={log.id} className="log-row">
                <TD className="timestamp">
                  <div className="date">
                    {log.dateLabel}
                  </div>
                  <div className="time">
                    {log.timeLabel}
                  </div>
                </TD>
                <TD className="user-cell">
                  <span className="user-badge">
                    {log.userFullName || log.user}
                    {log.userRoles?.length
                      ? ` (${log.userRoles.join(", ")})`
                      : ""}
                  </span>
                </TD>
                <TD className="action-cell">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={actionDisplay.variant}
                      className="normal-case tracking-normal text-xs"
                    >
                      {actionDisplay.label}
                    </Badge>
                    <span className="font-mono text-xs text-[var(--color-text-muted)]">
                      {log.action}
                    </span>
                  </div>
                </TD>
                <TD className="entity-cell">
                  <div className="entity-type">{log.entityType}</div>
                  <div className="entity-name">{log.entityName}</div>
                </TD>
                <TD className="details-cell">
                  <div className="change-summary">{formatDetails(log)}</div>
                </TD>
              </TR>
            );
            })}
          </TBody>
        </Table>
        {!isLoading && hasMore && (
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              justifyContent: "center",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Button type="button" variant="secondary" onClick={handleLoadMore}>
              Load more audit logs
            </Button>
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
              }}
            >
              Loaded {logs.length} logs
            </span>
          </div>
        )}
        {!isLoading && logs.length > 0 && !hasMore && (
            <div
              style={{
                marginTop: "12px",
                fontSize: "12px",
                color: "var(--text-tertiary)",
                textAlign: "center",
              }}
            >
              Loaded all available logs for the current filters
            </div>
          )}
        {!isLoading && logs.length === 0 && (
          <div className="empty-logs">
            <AlertTriangle size={48} />
            <EmptyState
              title={error ? "Failed to load audit logs" : "No audit logs found"}
              description={error ?? "No records match the selected filters."}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogViewer;
