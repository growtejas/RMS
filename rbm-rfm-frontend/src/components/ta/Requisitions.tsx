import React, { useState } from "react";

/* ======================================================
   Types
   ====================================================== */

interface Requisition {
  id: string;
  project: string;
  client?: string;
  priority: "High" | "Medium" | "Low";
  requiredBy: string; // Date
  overallStatus: "Open" | "In Progress" | "Closed";
  dateCreated: string;
  dateClosed?: string;
  raisedBy: string;
  assignedTA?: string;
  items: RequisitionItem[];
}

interface RequisitionItem {
  id: string;
  requisitionId: string;
  skill: string;
  level: string;
  education: string;
  itemStatus: "Pending" | "Fulfilled" | "Cancelled";
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  assignedDate?: string;
}

/* ======================================================
   Mock Data
   ====================================================== */

const mockRequisitions: Requisition[] = [
  {
    id: "REQ-2001",
    project: "Client Modernization",
    client: "FinTech Corp",
    priority: "High",
    requiredBy: "2024-04-15",
    overallStatus: "Open",
    dateCreated: "2024-03-10",
    raisedBy: "Rajesh Kumar",
    items: [
      {
        id: "ITEM-001",
        requisitionId: "REQ-2001",
        skill: "Java Developer",
        level: "Senior",
        education: "B.Tech",
        itemStatus: "Pending",
      },
      {
        id: "ITEM-002",
        requisitionId: "REQ-2001",
        skill: "React Developer",
        level: "Mid",
        education: "B.E",
        itemStatus: "Pending",
      },
      {
        id: "ITEM-003",
        requisitionId: "REQ-2001",
        skill: "QA Engineer",
        level: "Junior",
        education: "B.Sc",
        itemStatus: "Pending",
      },
    ],
  },
  {
    id: "REQ-2007",
    project: "Core Banking Upgrade",
    client: "Global Bank",
    priority: "Medium",
    requiredBy: "2024-05-20",
    overallStatus: "In Progress",
    dateCreated: "2024-03-01",
    raisedBy: "Priya Sharma",
    assignedTA: "Anita Sharma",
    items: [
      {
        id: "ITEM-004",
        requisitionId: "REQ-2007",
        skill: ".NET Developer",
        level: "Senior",
        education: "M.Tech",
        itemStatus: "Fulfilled",
        assignedEmployeeId: "EMP-045",
        assignedEmployeeName: "Vikram Singh",
        assignedDate: "2024-03-05",
      },
      {
        id: "ITEM-005",
        requisitionId: "REQ-2007",
        skill: "Database Architect",
        level: "Senior",
        education: "M.Sc",
        itemStatus: "Pending",
      },
    ],
  },
  {
    id: "REQ-2010",
    project: "Analytics Pipeline",
    client: "Data Insights Inc",
    priority: "Low",
    requiredBy: "2024-06-30",
    overallStatus: "In Progress",
    dateCreated: "2024-02-28",
    raisedBy: "Amit Patel",
    assignedTA: "Rahul Mehta",
    items: [
      {
        id: "ITEM-006",
        requisitionId: "REQ-2010",
        skill: "Data Scientist",
        level: "Senior",
        education: "Ph.D",
        itemStatus: "Fulfilled",
        assignedEmployeeId: "EMP-112",
        assignedEmployeeName: "Neha Verma",
        assignedDate: "2024-03-07",
      },
      {
        id: "ITEM-007",
        requisitionId: "REQ-2010",
        skill: "ML Engineer",
        level: "Mid",
        education: "M.Tech",
        itemStatus: "Cancelled",
      },
    ],
  },
];

/* ======================================================
   Props
   ====================================================== */

interface RequisitionsProps {
  currentTA?: string;
  onViewRequisition?: (reqId: string) => void;
  onSelfAssign?: (reqId: string) => void;
  onManageItems?: (reqId: string) => void;
}

/* ======================================================
   Helpers
   ====================================================== */

const getAgingClass = (days: number) => {
  if (days > 30) return "aging-30-plus";
  if (days > 7) return "aging-8-30";
  return "aging-0-7";
};

const getStatusClass = (status: Requisition["overallStatus"]) => {
  switch (status) {
    case "Open":
      return "open";
    case "In Progress":
      return "in-progress";
    case "Closed":
      return "closed";
    default:
      return "";
  }
};

const getPriorityClass = (priority: Requisition["priority"]) => {
  switch (priority) {
    case "High":
      return "priority-high";
    case "Medium":
      return "priority-medium";
    case "Low":
      return "priority-low";
    default:
      return "";
  }
};

const getItemStatusClass = (status: RequisitionItem["itemStatus"]) => {
  switch (status) {
    case "Pending":
      return "ticket-status open";
    case "Fulfilled":
      return "ticket-status fulfilled";
    case "Cancelled":
      return "ticket-status closed";
    default:
      return "";
  }
};

const calculateAgingDays = (dateString: string) => {
  const created = new Date(dateString);
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - created.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const calculateCompletion = (items: RequisitionItem[]) => {
  const total = items.length;
  const fulfilled = items.filter(
    (item) => item.itemStatus === "Fulfilled",
  ).length;
  const cancelled = items.filter(
    (item) => item.itemStatus === "Cancelled",
  ).length;
  const pending = total - fulfilled - cancelled;

  return {
    total,
    fulfilled,
    cancelled,
    pending,
    progress:
      total > 0 ? Math.round(((fulfilled + cancelled) / total) * 100) : 0,
  };
};

/* ======================================================
   Component: RequisitionStats
   ====================================================== */

const RequisitionStats: React.FC<{ requisitions: Requisition[] }> = ({
  requisitions,
}) => {
  const stats = {
    total: requisitions.length,
    open: requisitions.filter((r) => r.overallStatus === "Open").length,
    inProgress: requisitions.filter((r) => r.overallStatus === "In Progress")
      .length,
    totalItems: requisitions.reduce((sum, req) => sum + req.items.length, 0),
    pendingItems: requisitions.reduce(
      (sum, req) =>
        sum + req.items.filter((item) => item.itemStatus === "Pending").length,
      0,
    ),
    highPriority: requisitions.filter((r) => r.priority === "High").length,
  };

  return (
    <div className="tickets-kpi-grid">
      <div className="ticket-kpi-card success">
        <div className="kpi-number">{stats.total}</div>
        <div className="kpi-label">Total Requisitions</div>
        <div className="kpi-trend positive">+2 this week</div>
      </div>

      <div className="ticket-kpi-card warning">
        <div className="kpi-number">{stats.open}</div>
        <div className="kpi-label">Open Requisitions</div>
        <div className="kpi-trend">Awaiting assignment</div>
      </div>

      <div className="ticket-kpi-card critical">
        <div className="kpi-number">{stats.pendingItems}</div>
        <div className="kpi-label">Pending Positions</div>
        <div className="kpi-trend negative">Urgent attention needed</div>
      </div>

      <div className="ticket-kpi-card neutral">
        <div className="kpi-number">{stats.highPriority}</div>
        <div className="kpi-label">High Priority</div>
        <div className="kpi-trend">Require immediate action</div>
      </div>
    </div>
  );
};

/* ======================================================
   Component: RequisitionItemList
   ====================================================== */

interface RequisitionItemListProps {
  items: RequisitionItem[];
  requisitionId: string;
}

const RequisitionItemList: React.FC<RequisitionItemListProps> = ({
  items,
  requisitionId,
}) => {
  return (
    <div
      className="items-panel"
      style={{
        marginTop: "16px",
        backgroundColor: "var(--bg-secondary)",
        borderRadius: "12px",
        padding: "20px",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h4
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Requisition Items ({items.length} positions)
        </h4>
        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
          Each item = One required position
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              backgroundColor: "var(--bg-primary)",
              padding: "16px",
              borderRadius: "10px",
              border: "1px solid var(--border-light)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "8px",
                }}
              >
                <span className={getItemStatusClass(item.itemStatus)}>
                  {item.itemStatus}
                </span>
                <strong
                  style={{ fontSize: "13px", color: "var(--text-primary)" }}
                >
                  {item.skill} ({item.level})
                </strong>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Education: {item.education} •
                {item.assignedEmployeeName
                  ? ` Assigned: ${item.assignedEmployeeName}`
                  : " Unassigned"}
              </div>
            </div>

            {item.itemStatus === "Pending" && (
              <button
                className="action-button"
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                Assign Employee
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ======================================================
   Main Component
   ====================================================== */

const Requisitions: React.FC<RequisitionsProps> = ({
  currentTA = "Rahul Mehta",
  onViewRequisition,
  onSelfAssign,
  onManageItems,
}) => {
  const [requisitions, setRequisitions] =
    useState<Requisition[]>(mockRequisitions);
  const [expandedRequisition, setExpandedRequisition] = useState<string | null>(
    null,
  );

  const toggleRequisitionExpansion = (reqId: string) => {
    setExpandedRequisition(expandedRequisition === reqId ? null : reqId);
  };

  const handleSelfAssign = (reqId: string) => {
    setRequisitions((prev) =>
      prev.map((req) =>
        req.id === reqId ? { ...req, assignedTA: currentTA } : req,
      ),
    );
    onSelfAssign?.(reqId);
  };

  const handleItemAssignment = (reqId: string, itemId: string) => {
    // This would typically open a modal to select an employee
    console.log(`Assign employee to item ${itemId} in requisition ${reqId}`);
  };

  return (
    <>
      {/* Header */}
      <div className="manager-header">
        <h2>Requisition Management</h2>
        <p className="subtitle">
          HR demand queue — Manage requisitions and fulfill positions item by
          item
        </p>
      </div>

      {/* KPI Stats */}
      <RequisitionStats requisitions={requisitions} />

      {/* Quick Filter Chips */}
      <div className="filter-chips">
        <span className="filter-chip active">All Requisitions</span>
        <span className="filter-chip">Unassigned</span>
        <span className="filter-chip">High Priority</span>
        <span className="filter-chip">My Assignments</span>
        <span className="filter-chip">Open Items</span>
      </div>

      {/* Table */}
      <div className="ticket-table-container">
        <table className="ticket-table">
          <thead>
            <tr>
              <th>Req ID</th>
              <th>Project / Client</th>
              <th>Items Status</th>
              <th>Overall Status</th>
              <th>Priority</th>
              <th>Assigned TA</th>
              <th>Raised By</th>
              <th>Required By</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {requisitions.map((req) => {
              const agingDays = calculateAgingDays(req.dateCreated);
              const completion = calculateCompletion(req.items);
              const isOwnedByMe = req.assignedTA === currentTA;
              const isUnassigned = !req.assignedTA;
              const hasPendingItems = completion.pending > 0;

              return (
                <React.Fragment key={req.id}>
                  <tr>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <strong>{req.id}</strong>
                        <button
                          onClick={() => toggleRequisitionExpansion(req.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-tertiary)",
                            cursor: "pointer",
                          }}
                        >
                          {expandedRequisition === req.id ? "▲" : "▼"}
                        </button>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <strong>{req.project}</strong>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {req.client || "Internal Project"}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                          }}
                        >
                          <span
                            className={`status-badge ${hasPendingItems ? "inactive" : "active"}`}
                          >
                            {completion.pending} pending
                          </span>
                          <span
                            style={{
                              color: "var(--text-tertiary)",
                              fontSize: "12px",
                            }}
                          >
                            ({completion.fulfilled}/{completion.total})
                          </span>
                        </div>
                        <div
                          style={{
                            height: "4px",
                            background: "var(--border-subtle)",
                            borderRadius: "2px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${completion.progress}%`,
                              height: "100%",
                              background: "var(--success)",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`ticket-status ${getStatusClass(req.overallStatus)}`}
                      >
                        {req.overallStatus}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`priority-indicator ${getPriorityClass(req.priority)}`}
                      >
                        {req.priority}
                      </span>
                    </td>

                    <td>
                      {req.assignedTA ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background: isOwnedByMe
                                ? "var(--success)"
                                : "var(--warning)",
                            }}
                          />
                          {req.assignedTA}
                        </div>
                      ) : (
                        <span className="status-badge inactive">
                          Unassigned
                        </span>
                      )}
                    </td>

                    <td>
                      <span style={{ fontSize: "13px" }}>{req.raisedBy}</span>
                    </td>

                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "13px" }}>
                          {new Date(req.requiredBy).toLocaleDateString()}
                        </span>
                        <span
                          className={`aging-indicator ${getAgingClass(agingDays)}`}
                          style={{ fontSize: "11px" }}
                        >
                          {agingDays} days
                        </span>
                      </div>
                    </td>

                    {/* ACTION LOGIC — WORKFLOW CORRECT */}
                    <td>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {isUnassigned ? (
                          <button
                            className="action-button primary"
                            onClick={() => handleSelfAssign(req.id)}
                            style={{ fontSize: "12px", padding: "8px 12px" }}
                          >
                            Self Assign
                          </button>
                        ) : isOwnedByMe ? (
                          <button
                            className="action-button"
                            onClick={() => onManageItems?.(req.id)}
                            style={{ fontSize: "12px", padding: "8px 12px" }}
                          >
                            Manage Items
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--text-tertiary)",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <div
                              style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                background: "var(--warning)",
                              }}
                            />
                            Assigned
                          </span>
                        )}

                        <button
                          className="action-button"
                          onClick={() => onViewRequisition?.(req.id)}
                          style={{ fontSize: "12px", padding: "8px 12px" }}
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Item Details */}
                  {expandedRequisition === req.id && (
                    <tr>
                      <td
                        colSpan={9}
                        style={{
                          padding: "0",
                          borderTop: "1px solid var(--border-light)",
                        }}
                      >
                        <RequisitionItemList
                          items={req.items}
                          requisitionId={req.id}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {requisitions.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="tickets-empty-state">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    <h3>No Requisitions Found</h3>
                    <p>
                      When managers create requisitions, they will appear here
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Workflow Legend */}
      <div
        style={{
          marginTop: "24px",
          padding: "16px",
          backgroundColor: "var(--bg-tertiary)",
          borderRadius: "12px",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <h4
          style={{
            fontSize: "13px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "var(--text-primary)",
          }}
        >
          Workflow Legend
        </h4>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "3px",
                background: "#3b82f6",
              }}
            />
            <span style={{ fontSize: "12px" }}>
              Requisition = Demand Header
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "3px",
                background: "#10b981",
              }}
            />
            <span style={{ fontSize: "12px" }}>Item = Individual Position</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "3px",
                background: "#f59e0b",
              }}
            />
            <span style={{ fontSize: "12px" }}>HR works item by item</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "3px",
                background: "#64748b",
              }}
            />
            <span style={{ fontSize: "12px" }}>Close when all items done</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default Requisitions;
