import React, { useState } from "react";
import {
  Filter,
  Search,
  AlertCircle,
  CheckCircle,
  Users,
  Clock,
  Target,
  Briefcase,
  BarChart3,
  ChevronRight,
  UserPlus,
} from "lucide-react";

/* ======================================================
   Types
   ====================================================== */

interface Requisition {
  id: string;
  project: string;
  client?: string;
  priority: "High" | "Medium" | "Low";
  requiredBy: string;
  overallStatus: "Open" | "In Progress" | "Closed";
  dateCreated: string;
  dateClosed?: string;
  raisedBy: string;
  assignedTA?: string;
  items: RequisitionItem[];
  workMode?: "Remote" | "Hybrid" | "WFO";
  location?: string;
  justification?: string;
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
  experience?: number;
  description?: string;
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
    workMode: "Hybrid",
    location: "Bengaluru",
    justification: "Need to modernize legacy systems before Q2",
    items: [
      {
        id: "ITEM-001",
        requisitionId: "REQ-2001",
        skill: "Java Developer",
        level: "Senior",
        education: "B.Tech",
        itemStatus: "Pending",
        experience: 7,
        description: "Lead backend development with microservices",
      },
      {
        id: "ITEM-002",
        requisitionId: "REQ-2001",
        skill: "React Developer",
        level: "Mid",
        education: "B.E",
        itemStatus: "Pending",
        experience: 4,
        description: "Frontend development with modern React stack",
      },
      {
        id: "ITEM-003",
        requisitionId: "REQ-2001",
        skill: "QA Engineer",
        level: "Junior",
        education: "B.Sc",
        itemStatus: "Pending",
        experience: 2,
        description: "Manual and automated testing",
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
    workMode: "WFO",
    location: "Mumbai",
    justification: "Critical upgrade for compliance requirements",
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
        experience: 8,
        description: "Core banking system development",
      },
      {
        id: "ITEM-005",
        requisitionId: "REQ-2007",
        skill: "Database Architect",
        level: "Senior",
        education: "M.Sc",
        itemStatus: "Pending",
        experience: 10,
        description: "Database design and optimization",
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
    workMode: "Remote",
    location: "Pune",
    justification: "New analytics platform for client reporting",
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
        experience: 6,
        description: "Machine learning model development",
      },
      {
        id: "ITEM-007",
        requisitionId: "REQ-2010",
        skill: "ML Engineer",
        level: "Mid",
        education: "M.Tech",
        itemStatus: "Cancelled",
        experience: 4,
        description: "ML pipeline implementation",
      },
    ],
  },
  {
    id: "REQ-2015",
    project: "Mobile App Redesign",
    client: "Retail Tech",
    priority: "High",
    requiredBy: "2024-04-30",
    overallStatus: "Open",
    dateCreated: "2024-03-12",
    raisedBy: "Sneha Desai",
    workMode: "Hybrid",
    location: "Delhi",
    justification: "Complete mobile app overhaul for better UX",
    items: [
      {
        id: "ITEM-008",
        requisitionId: "REQ-2015",
        skill: "Flutter Developer",
        level: "Mid",
        education: "B.Tech",
        itemStatus: "Pending",
        experience: 3,
        description: "Cross-platform mobile development",
      },
      {
        id: "ITEM-009",
        requisitionId: "REQ-2015",
        skill: "UI/UX Designer",
        level: "Senior",
        education: "B.Des",
        itemStatus: "Pending",
        experience: 5,
        description: "User interface and experience design",
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
  onAssignToOther?: (reqId: string, taName: string) => void;
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

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/* ======================================================
   Component: TAKpiCards
   ====================================================== */

const TAKpiCards: React.FC<{
  requisitions: Requisition[];
  currentTA: string;
}> = ({ requisitions, currentTA }) => {
  const stats = {
    totalAssigned: requisitions.filter((r) => r.assignedTA === currentTA)
      .length,
    unassigned: requisitions.filter((r) => !r.assignedTA).length,
    pendingItems: requisitions.reduce(
      (sum, req) =>
        sum + req.items.filter((item) => item.itemStatus === "Pending").length,
      0,
    ),
    highPriority: requisitions.filter(
      (r) => r.priority === "High" && r.assignedTA === currentTA,
    ).length,
    avgCompletion: Math.round(
      requisitions
        .filter((r) => r.assignedTA === currentTA)
        .reduce(
          (sum, req) => sum + calculateCompletion(req.items).progress,
          0,
        ) /
        Math.max(
          requisitions.filter((r) => r.assignedTA === currentTA).length,
          1,
        ),
    ),
    overdue: requisitions.filter(
      (r) =>
        calculateAgingDays(r.dateCreated) > 30 && r.assignedTA === currentTA,
    ).length,
  };

  return (
    <div className="tickets-kpi-grid">
      <div className="ticket-kpi-card success">
        <div className="kpi-number">{stats.totalAssigned}</div>
        <div className="kpi-label">
          <Briefcase size={12} />
          My Assignments
        </div>
        <div className="kpi-trend positive">
          {stats.avgCompletion}% average completion
        </div>
      </div>

      <div className="ticket-kpi-card warning">
        <div className="kpi-number">{stats.unassigned}</div>
        <div className="kpi-label">
          <AlertCircle size={12} />
          Unassigned Tickets
        </div>
        <div className="kpi-trend">Available for pickup</div>
      </div>

      <div className="ticket-kpi-card critical">
        <div className="kpi-number">{stats.pendingItems}</div>
        <div className="kpi-label">
          <Users size={12} />
          Pending Positions
        </div>
        <div className="kpi-trend negative">
          Across {requisitions.filter((r) => r.assignedTA === currentTA).length}{" "}
          requisitions
        </div>
      </div>

      <div className="ticket-kpi-card neutral">
        <div className="kpi-number">{stats.overdue}</div>
        <div className="kpi-label">
          <Clock size={12} />
          Overdue Tickets
        </div>
        <div className="kpi-trend">
          {stats.overdue > 0 ? "Needs attention" : "All good"}
        </div>
      </div>
    </div>
  );
};

/* ======================================================
   Component: QuickAssignmentPanel
   ====================================================== */

interface QuickAssignmentPanelProps {
  requisition: Requisition;
  onAssign: (reqId: string, taName: string) => void;
  availableTAs: string[];
}

const QuickAssignmentPanel: React.FC<QuickAssignmentPanelProps> = ({
  requisition,
  onAssign,
  availableTAs,
}) => {
  const [selectedTA, setSelectedTA] = useState<string>("");

  return (
    <div
      style={{
        padding: "20px",
        backgroundColor: "var(--bg-primary)",
        borderRadius: "12px",
        border: "1px solid var(--border-subtle)",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <UserPlus size={16} color="var(--primary-accent)" />
        <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>
          Quick Assignment
        </strong>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "12px",
          alignItems: "end",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-tertiary)",
              marginBottom: "8px",
            }}
          >
            Assign to TA
          </div>
          <select
            value={selectedTA}
            onChange={(e) => setSelectedTA(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-tertiary)",
              fontSize: "13px",
            }}
          >
            <option value="">Select TA...</option>
            {availableTAs.map((ta) => (
              <option key={ta} value={ta}>
                {ta}
              </option>
            ))}
          </select>
        </div>

        <button
          className="action-button primary"
          onClick={() => {
            if (selectedTA) {
              onAssign(requisition.id, selectedTA);
              setSelectedTA("");
            }
          }}
          disabled={!selectedTA}
          style={{ padding: "10px 20px" }}
        >
          Assign
        </button>
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
  const [activeFilter, setActiveFilter] = useState<
    "all" | "my" | "unassigned" | "high" | "overdue"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter requisitions
  const filteredRequisitions = requisitions.filter((req) => {
    // Status filter
    if (activeFilter === "my" && req.assignedTA !== currentTA) return false;
    if (activeFilter === "unassigned" && req.assignedTA) return false;
    if (activeFilter === "high" && req.priority !== "High") return false;
    if (activeFilter === "overdue" && calculateAgingDays(req.dateCreated) <= 30)
      return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        req.id.toLowerCase().includes(query) ||
        req.project.toLowerCase().includes(query) ||
        req.client?.toLowerCase().includes(query) ||
        req.raisedBy.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const handleSelfAssign = (reqId: string) => {
    setRequisitions((prev) =>
      prev.map((req) =>
        req.id === reqId ? { ...req, assignedTA: currentTA } : req,
      ),
    );
    onSelfAssign?.(reqId);
  };

  // Calculate stats for current TA
  const myRequisitions = requisitions.filter((r) => r.assignedTA === currentTA);
  const myStats = {
    total: myRequisitions.length,
    pendingPositions: myRequisitions.reduce(
      (sum, req) =>
        sum + req.items.filter((item) => item.itemStatus === "Pending").length,
      0,
    ),
    completionRate:
      myRequisitions.length > 0
        ? Math.round(
            myRequisitions.reduce(
              (sum, req) => sum + calculateCompletion(req.items).progress,
              0,
            ) / myRequisitions.length,
          )
        : 0,
    overdue: myRequisitions.filter(
      (r) => calculateAgingDays(r.dateCreated) > 30,
    ).length,
  };

  return (
    <>
      {/* Header */}
      <div className="manager-header">
        <h2>Talent Acquisition Dashboard</h2>
        <p className="subtitle">
          Manage assigned requisitions and fulfill positions item by item
        </p>
      </div>

      {/* KPI Stats */}
      <TAKpiCards requisitions={requisitions} currentTA={currentTA} />

      {/* Personal Stats */}
      {myRequisitions.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-primary)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
                marginBottom: "4px",
              }}
            >
              Your Assignments
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700 }}>
              {myStats.total}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {myStats.pendingPositions} positions pending
            </div>
          </div>

          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-primary)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
                marginBottom: "4px",
              }}
            >
              Completion Rate
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--success)",
              }}
            >
              {myStats.completionRate}%
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Average across your tickets
            </div>
          </div>

          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-primary)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
                marginBottom: "4px",
              }}
            >
              Pending Positions
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--warning)",
              }}
            >
              {myStats.pendingPositions}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Across {myStats.total} requisitions
            </div>
          </div>

          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-primary)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
                marginBottom: "4px",
              }}
            >
              Overdue
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: myStats.overdue > 0 ? "var(--error)" : "var(--success)",
              }}
            >
              {myStats.overdue}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Requiring immediate attention
            </div>
          </div>
        </div>
      )}

      {/* Filter Chips */}
      <div className="filter-chips" style={{ marginBottom: "20px" }}>
        <button
          className={`filter-chip ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          <Filter size={12} />
          All Requisitions ({requisitions.length})
        </button>
        <button
          className={`filter-chip ${activeFilter === "my" ? "active" : ""}`}
          onClick={() => setActiveFilter("my")}
        >
          <Briefcase size={12} />
          My Assignments (
          {requisitions.filter((r) => r.assignedTA === currentTA).length})
        </button>
        <button
          className={`filter-chip ${activeFilter === "unassigned" ? "active" : ""}`}
          onClick={() => setActiveFilter("unassigned")}
        >
          <UserPlus size={12} />
          Unassigned ({requisitions.filter((r) => !r.assignedTA).length})
        </button>
        <button
          className={`filter-chip ${activeFilter === "high" ? "active" : ""}`}
          onClick={() => setActiveFilter("high")}
        >
          <Target size={12} />
          High Priority (
          {requisitions.filter((r) => r.priority === "High").length})
        </button>
        <button
          className={`filter-chip ${activeFilter === "overdue" ? "active" : ""}`}
          onClick={() => setActiveFilter("overdue")}
        >
          <Clock size={12} />
          Overdue (
          {
            requisitions.filter((r) => calculateAgingDays(r.dateCreated) > 30)
              .length
          }
          )
        </button>
      </div>

      {/* Search and Filters */}
      <div className="log-filters" style={{ marginBottom: "24px" }}>
        <div className="filter-group">
          <div className="search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search requisitions by ID, project, or client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-grid">
          <div className="filter-item">
            <label>Priority</label>
            <select>
              <option>All Priorities</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
          <div className="filter-item">
            <label>Status</label>
            <select>
              <option>All Status</option>
              <option>Open</option>
              <option>In Progress</option>
              <option>Closed</option>
            </select>
          </div>
          <div className="filter-item">
            <label>Location</label>
            <select>
              <option>All Locations</option>
              <option>Bengaluru</option>
              <option>Mumbai</option>
              <option>Delhi</option>
              <option>Pune</option>
            </select>
          </div>
          <div className="filter-item">
            <label>Work Mode</label>
            <select>
              <option>All Modes</option>
              <option>Remote</option>
              <option>Hybrid</option>
              <option>WFO</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="ticket-table-container">
        <table className="ticket-table">
          <thead>
            <tr>
              <th>Req ID</th>
              <th>Project & Client</th>
              <th>Positions</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Raised By</th>
              <th>Aging</th>
              <th>Assigned TA</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredRequisitions.map((req) => {
              const agingDays = calculateAgingDays(req.dateCreated);
              const completion = calculateCompletion(req.items);
              const isAssignedToMe = req.assignedTA === currentTA;
              const isUnassigned = !req.assignedTA;

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
                        {isAssignedToMe && (
                          <div
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              backgroundColor: "var(--success)",
                            }}
                          />
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <strong style={{ fontSize: "14px" }}>
                          {req.project}
                        </strong>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginTop: "4px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--text-tertiary)",
                            }}
                          >
                            {req.client || "Internal"}
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-quaternary)",
                            }}
                          >
                            • {req.workMode || "Hybrid"} • {req.location}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "60px",
                              height: "4px",
                              backgroundColor: "var(--border-subtle)",
                              borderRadius: "2px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${completion.progress}%`,
                                height: "100%",
                                backgroundColor:
                                  completion.progress === 100
                                    ? "var(--success)"
                                    : "var(--primary-accent)",
                                transition: "width 0.3s ease",
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {completion.pending} pending
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {completion.fulfilled}/{completion.total} filled
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`priority-indicator ${getPriorityClass(req.priority)}`}
                      >
                        {req.priority}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`ticket-status ${getStatusClass(req.overallStatus)}`}
                      >
                        {req.overallStatus}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "13px" }}>{req.raisedBy}</span>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {formatDate(req.dateCreated)}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`aging-indicator ${getAgingClass(agingDays)}`}
                      >
                        {agingDays}d
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
                              backgroundColor: isAssignedToMe
                                ? "var(--success)"
                                : "var(--warning)",
                            }}
                          />
                          <span style={{ fontSize: "13px" }}>
                            {req.assignedTA}
                          </span>
                        </div>
                      ) : (
                        <span className="status-badge inactive">
                          Unassigned
                        </span>
                      )}
                    </td>

                    <td>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {isUnassigned ? (
                          <>
                            <button
                              className="action-button primary"
                              onClick={() => handleSelfAssign(req.id)}
                              style={{ fontSize: "12px", padding: "6px 12px" }}
                            >
                              Self Assign
                            </button>
                          </>
                        ) : isAssignedToMe ? (
                          <>
                            <button
                              className="action-button primary"
                              onClick={() => onManageItems?.(req.id)}
                              style={{ fontSize: "12px", padding: "6px 12px" }}
                            >
                              Manage Items
                            </button>
                            <button
                              className="action-button"
                              onClick={() => onViewRequisition?.(req.id)}
                              style={{ fontSize: "12px", padding: "6px 12px" }}
                            >
                              View
                            </button>
                          </>
                        ) : (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--text-tertiary)",
                            }}
                          >
                            Assigned to another TA
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}

            {filteredRequisitions.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="tickets-empty-state">
                    <BarChart3
                      size={48}
                      style={{ marginBottom: "16px", opacity: 0.5 }}
                    />
                    <h3>No requisitions found</h3>
                    <p>Try adjusting your filters or search criteria</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div
        style={{
          marginTop: "24px",
          padding: "16px",
          backgroundColor: "var(--bg-tertiary)",
          borderRadius: "12px",
          fontSize: "12px",
          color: "var(--text-secondary)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            Showing <strong>{filteredRequisitions.length}</strong> of{" "}
            <strong>{requisitions.length}</strong> requisitions
            {activeFilter === "my" && (
              <span
                style={{ marginLeft: "12px", color: "var(--primary-accent)" }}
              >
                • {myStats.pendingPositions} positions pending in your
                assignments
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "16px" }}>
            <span>
              ⚡{" "}
              {
                requisitions.filter(
                  (r) => r.priority === "High" && !r.assignedTA,
                ).length
              }{" "}
              high priority unassigned
            </span>
            <span>
              ⏱ Avg aging:{" "}
              {Math.round(
                requisitions.reduce(
                  (sum, req) => sum + calculateAgingDays(req.dateCreated),
                  0,
                ) / requisitions.length,
              )}{" "}
              days
            </span>
          </div>
        </div>
      </div>

      {/* Workflow Guidance */}
      <div
        style={{
          marginTop: "32px",
          padding: "20px",
          backgroundColor: "rgba(59, 130, 246, 0.05)",
          borderRadius: "12px",
          border: "1px solid rgba(59, 130, 246, 0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <AlertCircle size={20} color="var(--primary-accent)" />
          <div>
            <h3
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              TA Workflow
            </h3>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              How to efficiently manage requisitions
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "16px",
          }}
        >
          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--primary-accent)",
                  }}
                >
                  1
                </span>
              </div>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                Pick Up Tickets
              </span>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
              }}
            >
              Assign yourself to unassigned requisitions or get assigned by HR
            </p>
          </div>

          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--primary-accent)",
                  }}
                >
                  2
                </span>
              </div>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                Review Items
              </span>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
              }}
            >
              Each requisition has multiple items (positions) - review
              requirements
            </p>
          </div>

          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--primary-accent)",
                  }}
                >
                  3
                </span>
              </div>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                Assign Resources
              </span>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
              }}
            >
              Match employees to each item - work item by item
            </p>
          </div>

          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--primary-accent)",
                  }}
                >
                  4
                </span>
              </div>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                Track Progress
              </span>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
              }}
            >
              Monitor completion - requisition closes when all items are done
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div
        style={{
          marginTop: "24px",
          padding: "20px",
          backgroundColor: "var(--bg-primary)",
          borderRadius: "12px",
          border: "1px solid var(--border-subtle)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-tertiary)",
              marginBottom: "4px",
            }}
          >
            Total Unassigned
          </div>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>
            {requisitions.filter((r) => !r.assignedTA).length}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-tertiary)",
              marginBottom: "4px",
            }}
          >
            High Priority Open
          </div>
          <div
            style={{ fontSize: "20px", fontWeight: 700, color: "var(--error)" }}
          >
            {
              requisitions.filter(
                (r) => r.priority === "High" && r.overallStatus !== "Closed",
              ).length
            }
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-tertiary)",
              marginBottom: "4px",
            }}
          >
            Total Positions
          </div>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>
            {requisitions.reduce((sum, req) => sum + req.items.length, 0)}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-tertiary)",
              marginBottom: "4px",
            }}
          >
            Pending Positions
          </div>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--warning)",
            }}
          >
            {requisitions.reduce(
              (sum, req) =>
                sum +
                req.items.filter((item) => item.itemStatus === "Pending")
                  .length,
              0,
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Requisitions;
