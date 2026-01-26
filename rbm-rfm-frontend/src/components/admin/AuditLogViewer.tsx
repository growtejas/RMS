// rbm-rfm-frontend/src/components/admin/AuditLogViewer.tsx
import React, { useState, useEffect } from "react";
import {
  Search,
  Filter,
  Download,
  Eye,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { apiClient } from "../../api/client";

interface AuditLog {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  entityType: "employee" | "requisition" | "user" | "role" | "system";
  entityId: number;
  entityName: string;
  oldValue: string;
  newValue: string;
  ipAddress: string;
  severity: "info" | "warning" | "error" | "critical";
}

type AuditLogResponse = {
  audit_id: number;
  entity_name: string;
  entity_id: string | null;
  action: string;
  performed_by: number | null;
  performed_at: string;
  performed_by_username?: string | null;
};

const normalizeAudit = (log: AuditLogResponse): AuditLog => ({
  id: log.audit_id,
  timestamp: log.performed_at,
  user: log.performed_by_username || log.performed_by?.toString() || "System",
  action: log.action,
  entityType: "system",
  entityId: log.entity_id ? Number(log.entity_id) : 0,
  entityName: log.entity_name,
  oldValue: "",
  newValue: "",
  ipAddress: "-",
  severity: log.action === "DELETE" ? "error" : "info",
});

const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    dateFrom: "",
    dateTo: "",
    user: "",
    action: "",
    severity: "",
  });
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<
        AuditLogResponse[] | { logs: AuditLogResponse[] }
      >("/audit-logs/");
      const raw = Array.isArray(response.data)
        ? response.data
        : response.data.logs || [];
      const mapped = raw.map(normalizeAudit);
      setLogs(mapped);
      setFilteredLogs(mapped);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load audit logs";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const applyFilters = () => {
    let filtered = [...logs];

    if (filters.search) {
      filtered = filtered.filter(
        (log) =>
          log.user.toLowerCase().includes(filters.search.toLowerCase()) ||
          log.entityName.toLowerCase().includes(filters.search.toLowerCase()) ||
          log.action.toLowerCase().includes(filters.search.toLowerCase()),
      );
    }

    if (filters.dateFrom) {
      filtered = filtered.filter(
        (log) => new Date(log.timestamp) >= new Date(filters.dateFrom),
      );
    }

    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((log) => new Date(log.timestamp) <= end);
    }

    if (filters.user) {
      filtered = filtered.filter((log) => log.user === filters.user);
    }

    if (filters.action) {
      filtered = filtered.filter((log) => log.action === filters.action);
    }

    if (filters.severity) {
      filtered = filtered.filter((log) => log.severity === filters.severity);
    }

    setFilteredLogs(filtered);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "#dc2626";
      case "error":
        return "#ef4444";
      case "warning":
        return "#f59e0b";
      case "info":
        return "#3b82f6";
      default:
        return "#6b7280";
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "CREATE":
        return "🆕";
      case "UPDATE":
        return "✏️";
      case "DELETE":
        return "🗑️";
      case "LOGIN":
        return "🔐";
      case "LOGOUT":
        return "🚪";
      default:
        return "📝";
    }
  };

  return (
    <div className="audit-log-viewer">
      <div className="viewer-header">
        <div className="header-left">
          <h2>Audit Log Review</h2>
          <p className="subtitle">
            Track all system changes and user activities
          </p>
        </div>
        <div className="header-actions">
          <button className="action-button" onClick={fetchLogs}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="action-button">
            <Download size={16} />
            Export Logs
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="log-filters">
        <div className="filter-group">
          <div className="search-box">
            <Search size={18} />
            <input
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
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters({ ...filters, dateFrom: e.target.value })
              }
            />
          </div>
          <div className="filter-item">
            <label>To Date</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters({ ...filters, dateTo: e.target.value })
              }
            />
          </div>
          <div className="filter-item">
            <label>User</label>
            <select
              value={filters.user}
              onChange={(e) => setFilters({ ...filters, user: e.target.value })}
            >
              <option value="">All Users</option>
              {[...new Set(logs.map((log) => log.user))].map((user) => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <label>Severity</label>
            <select
              value={filters.severity}
              onChange={(e) =>
                setFilters({ ...filters, severity: e.target.value })
              }
            >
              <option value="">All Levels</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="filter-item">
            <label>Action</label>
            <select
              value={filters.action}
              onChange={(e) =>
                setFilters({ ...filters, action: e.target.value })
              }
            >
              <option value="">All Actions</option>
              {[...new Set(logs.map((log) => log.action))].map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <button className="apply-filters-button" onClick={applyFilters}>
              <Filter size={16} />
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="log-stats">
        <div className="stat-card">
          <span className="stat-number">{logs.length}</span>
          <span className="stat-label">Total Logs</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">
            {
              logs.filter(
                (l) => l.severity === "warning" || l.severity === "error",
              ).length
            }
          </span>
          <span className="stat-label">Warnings & Errors</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">
            {[...new Set(logs.map((l) => l.user))].length}
          </span>
          <span className="stat-label">Active Users</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">
            {logs.filter((l) => l.action === "LOGIN_FAILED").length}
          </span>
          <span className="stat-label">Failed Logins</span>
        </div>
      </div>

      {/* Log Table */}
      <div className="log-table-container">
        <table className="log-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
              <th>Severity</th>
              <th>IP Address</th>
              <th>View</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="table-loading">
                  Loading audit logs...
                </td>
              </tr>
            )}
            {filteredLogs.map((log) => (
              <tr key={log.id} className={`log-row severity-${log.severity}`}>
                <td className="timestamp">
                  <div className="date">
                    {new Date(log.timestamp).toLocaleDateString()}
                  </div>
                  <div className="time">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                </td>
                <td className="user-cell">
                  <span className="user-badge">{log.user}</span>
                </td>
                <td className="action-cell">
                  <span className="action-icon">
                    {getActionIcon(log.action)}
                  </span>
                  {log.action}
                </td>
                <td className="entity-cell">
                  <div className="entity-type">{log.entityType}</div>
                  <div className="entity-name">{log.entityName}</div>
                </td>
                <td className="details-cell">
                  <div className="change-summary">
                    {log.oldValue && (
                      <span className="old-value">{log.oldValue}</span>
                    )}
                    {log.oldValue && log.newValue && (
                      <span className="arrow">→</span>
                    )}
                    {log.newValue && (
                      <span className="new-value">{log.newValue}</span>
                    )}
                  </div>
                </td>
                <td className="severity-cell">
                  <span
                    className="severity-badge"
                    style={{ backgroundColor: getSeverityColor(log.severity) }}
                  >
                    {log.severity.toUpperCase()}
                  </span>
                </td>
                <td className="ip-cell">
                  <code>{log.ipAddress}</code>
                </td>
                <td className="actions-cell">
                  <button
                    className="view-button"
                    onClick={() => setSelectedLog(log)}
                    title="View Details"
                  >
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filteredLogs.length === 0 && (
          <div className="empty-logs">
            <AlertTriangle size={48} />
            <p>{error ?? "No audit logs found matching your filters"}</p>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header">
              <h3>Audit Log Details</h3>
              <button
                className="close-button"
                onClick={() => setSelectedLog(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="log-details-grid">
                <div className="detail-item">
                  <label>Timestamp</label>
                  <span>{selectedLog.timestamp}</span>
                </div>
                <div className="detail-item">
                  <label>User</label>
                  <span className="user-highlight">{selectedLog.user}</span>
                </div>
                <div className="detail-item">
                  <label>IP Address</label>
                  <code>{selectedLog.ipAddress}</code>
                </div>
                <div className="detail-item">
                  <label>Action</label>
                  <span className="action-badge">
                    {getActionIcon(selectedLog.action)} {selectedLog.action}
                  </span>
                </div>
                <div className="detail-item">
                  <label>Entity Type</label>
                  <span>{selectedLog.entityType}</span>
                </div>
                <div className="detail-item">
                  <label>Entity ID</label>
                  <span>{selectedLog.entityId}</span>
                </div>
                <div className="detail-item">
                  <label>Entity Name</label>
                  <span>{selectedLog.entityName}</span>
                </div>
                <div className="detail-item full-width">
                  <label>Severity</label>
                  <span
                    className="severity-badge-large"
                    style={{
                      backgroundColor: getSeverityColor(selectedLog.severity),
                    }}
                  >
                    {selectedLog.severity.toUpperCase()}
                  </span>
                </div>
                <div className="detail-item full-width">
                  <label>Old Value</label>
                  <div className="value-box old">
                    {selectedLog.oldValue || <em>No previous value</em>}
                  </div>
                </div>
                <div className="detail-item full-width">
                  <label>New Value</label>
                  <div className="value-box new">{selectedLog.newValue}</div>
                </div>
                <div className="detail-item full-width">
                  <label>Change Summary</label>
                  <div className="change-visualization">
                    <div className="old-value-visual">
                      <span className="visual-label">Before:</span>
                      {selectedLog.oldValue || "Empty"}
                    </div>
                    <div className="arrow-visual">→</div>
                    <div className="new-value-visual">
                      <span className="visual-label">After:</span>
                      {selectedLog.newValue}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="close-details-button"
                onClick={() => setSelectedLog(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogViewer;
