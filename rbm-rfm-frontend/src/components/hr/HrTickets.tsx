import React, { useState } from "react";
import {
  Users,
  Target,
  Clock,
  CheckCircle,
  AlertCircle,
  UserPlus,
  Filter,
  BarChart3,
  Briefcase,
} from "lucide-react";

/* ======================================================
   Types
   ====================================================== */

interface Requisition {
  id: string;
  project: string;
  client: string;
  priority: "High" | "Medium" | "Low";
  overallStatus: "Open" | "In Progress" | "Closed";
  dateCreated: string;
  requiredBy: string;
  raisedBy: string;
  assignedTA?: string;
  items: RequisitionItem[];
}

interface RequisitionItem {
  id: string;
  skill: string;
  level: string;
  experience: number;
  education: string;
  itemStatus: "Pending" | "Fulfilled" | "Cancelled";
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
}

interface EmployeeMatch {
  id: string;
  name: string;
  skill: string;
  level: string;
  experience: number;
  location: string;
  availability: "Available" | "On Project" | "On Notice";
  matchScore: number;
  department: string;
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
    overallStatus: "Open",
    dateCreated: "2024-03-10",
    requiredBy: "2024-04-15",
    raisedBy: "Rajesh Kumar",
    items: [
      {
        id: "ITEM-001",
        skill: "Java Developer",
        level: "Senior",
        experience: 7,
        education: "B.Tech",
        itemStatus: "Pending",
      },
      {
        id: "ITEM-002",
        skill: "React Developer",
        level: "Mid",
        experience: 4,
        education: "B.E",
        itemStatus: "Pending",
      },
    ],
  },
  {
    id: "REQ-2007",
    project: "Core Banking Upgrade",
    client: "Global Bank",
    priority: "Medium",
    overallStatus: "In Progress",
    dateCreated: "2024-03-01",
    requiredBy: "2024-05-20",
    raisedBy: "Priya Sharma",
    assignedTA: "Anita Sharma",
    items: [
      {
        id: "ITEM-004",
        skill: ".NET Developer",
        level: "Senior",
        experience: 8,
        education: "M.Tech",
        itemStatus: "Fulfilled",
        assignedEmployeeId: "EMP-045",
        assignedEmployeeName: "Vikram Singh",
      },
      {
        id: "ITEM-005",
        skill: "Database Architect",
        level: "Senior",
        experience: 10,
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
    overallStatus: "In Progress",
    dateCreated: "2024-02-28",
    requiredBy: "2024-06-30",
    raisedBy: "Amit Patel",
    assignedTA: "Current User",
    items: [
      {
        id: "ITEM-006",
        skill: "Data Scientist",
        level: "Senior",
        experience: 6,
        education: "Ph.D",
        itemStatus: "Pending",
      },
      {
        id: "ITEM-007",
        skill: "ML Engineer",
        level: "Mid",
        experience: 4,
        education: "M.Tech",
        itemStatus: "Cancelled",
      },
    ],
  },
];

const mockEmployees: EmployeeMatch[] = [
  {
    id: "EMP-078",
    name: "Arun Verma",
    skill: "Java Developer",
    level: "Senior",
    experience: 8,
    location: "Bengaluru",
    availability: "Available",
    matchScore: 92,
    department: "Engineering",
  },
  {
    id: "EMP-112",
    name: "Neha Sharma",
    skill: "React Developer",
    level: "Mid",
    experience: 5,
    location: "Mumbai",
    availability: "Available",
    matchScore: 88,
    department: "Frontend",
  },
  {
    id: "EMP-045",
    name: "Vikram Singh",
    skill: ".NET Developer",
    level: "Senior",
    experience: 8,
    location: "Delhi",
    availability: "On Project",
    matchScore: 95,
    department: "Backend",
  },
];

/* ======================================================
   Props
   ====================================================== */

interface HrRequisitionsProps {
  currentUser?: string;
  onAssignRequisition?: (reqId: string, taId: string) => void;
  onAssignEmployee?: (itemId: string, empId: string) => void;
  onViewRequisition?: (reqId: string) => void;
}

/* ======================================================
   Helper Functions
   ====================================================== */

const getAgingDays = (dateString: string) => {
  const created = new Date(dateString);
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - created.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getAgingClass = (days: number) => {
  if (days > 30) return "aging-30-plus";
  if (days > 7) return "aging-8-30";
  return "aging-0-7";
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

const getStatusClass = (status: Requisition["overallStatus"]) => {
  switch (status) {
    case "Open":
      return "ticket-status open";
    case "In Progress":
      return "ticket-status in-progress";
    case "Closed":
      return "ticket-status closed";
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

const calculateCompletion = (items: RequisitionItem[]) => {
  const total = items.length;
  const fulfilled = items.filter(
    (item) => item.itemStatus === "Fulfilled",
  ).length;
  const pending = items.filter((item) => item.itemStatus === "Pending").length;

  return {
    total,
    fulfilled,
    pending,
    progress: total > 0 ? Math.round((fulfilled / total) * 100) : 0,
  };
};

/* ======================================================
   Component: HrKpiCards
   ====================================================== */

const HrKpiCards: React.FC<{ requisitions: Requisition[] }> = ({
  requisitions,
}) => {
  const stats = {
    totalOpen: requisitions.filter((r) => r.overallStatus === "Open").length,
    inProgress: requisitions.filter((r) => r.overallStatus === "In Progress")
      .length,
    unassigned: requisitions.filter((r) => !r.assignedTA).length,
    myAssignments: requisitions.filter((r) => r.assignedTA === "Current User")
      .length,
    totalPositions: requisitions.reduce(
      (sum, req) => sum + req.items.length,
      0,
    ),
    pendingItems: requisitions.reduce(
      (sum, req) =>
        sum + req.items.filter((item) => item.itemStatus === "Pending").length,
      0,
    ),
    benchCount: 3, // This would come from API
    avgAging:
      Math.round(
        requisitions.reduce(
          (sum, req) => sum + getAgingDays(req.dateCreated),
          0,
        ) / requisitions.length,
      ) || 0,
  };

  return (
    <div className="tickets-kpi-grid">
      <div className="ticket-kpi-card critical">
        <div className="kpi-number">{stats.totalOpen}</div>
        <div className="kpi-label">
          <AlertCircle size={12} />
          Unassigned Requisitions
        </div>
        <div className="kpi-trend negative">
          {stats.unassigned} need assignment
        </div>
      </div>

      <div className="ticket-kpi-card warning">
        <div className="kpi-number">{stats.pendingItems}</div>
        <div className="kpi-label">
          <Clock size={12} />
          Pending Positions
        </div>
        <div className="kpi-trend">
          Across {requisitions.length} requisitions
        </div>
      </div>

      <div className="ticket-kpi-card success">
        <div className="kpi-number">{stats.benchCount}</div>
        <div className="kpi-label">
          <Users size={12} />
          Resources on Bench
        </div>
        <div className="kpi-trend positive">Available for assignment</div>
      </div>

      <div className="ticket-kpi-card neutral">
        <div className="kpi-number">{stats.avgAging}d</div>
        <div className="kpi-label">
          <Target size={12} />
          Average Aging
        </div>
        <div className="kpi-trend">
          {stats.avgAging > 30
            ? "Urgent attention needed"
            : "Within acceptable range"}
        </div>
      </div>
    </div>
  );
};

/* ======================================================
   Component: MatchmakingPanel
   ====================================================== */

interface MatchmakingPanelProps {
  requisition: Requisition;
  employees: EmployeeMatch[];
  onAssignEmployee: (itemId: string, empId: string) => void;
}

const MatchmakingPanel: React.FC<MatchmakingPanelProps> = ({
  requisition,
  employees,
  onAssignEmployee,
}) => {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "24px",
        height: "100%",
      }}
    >
      {/* Left Panel - Demand */}
      <div
        style={{
          backgroundColor: "var(--bg-primary)",
          borderRadius: "16px",
          padding: "24px",
          border: "1px solid var(--border-subtle)",
          overflowY: "auto",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}
          >
            <Briefcase
              size={16}
              style={{ marginRight: "8px", verticalAlign: "middle" }}
            />
            Demand Details
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "16px",
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
                Requisition ID
              </div>
              <div style={{ fontWeight: 600 }}>{requisition.id}</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Project
              </div>
              <div style={{ fontWeight: 600 }}>{requisition.project}</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Client
              </div>
              <div>{requisition.client}</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Raised By
              </div>
              <div>{requisition.raisedBy}</div>
            </div>
          </div>
        </div>

        <h4
          style={{
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "16px",
            color: "var(--text-primary)",
          }}
        >
          Requisition Items ({requisition.items.length} positions)
        </h4>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {requisition.items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: "16px",
                borderRadius: "12px",
                border:
                  selectedItem === item.id
                    ? "2px solid var(--primary-accent)"
                    : "1px solid var(--border-subtle)",
                backgroundColor:
                  selectedItem === item.id
                    ? "rgba(59, 130, 246, 0.05)"
                    : "var(--bg-secondary)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onClick={() => setSelectedItem(item.id)}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <div>
                  <span className={getItemStatusClass(item.itemStatus)}>
                    {item.itemStatus}
                  </span>
                  <strong style={{ marginLeft: "8px", fontSize: "14px" }}>
                    {item.skill} ({item.level})
                  </strong>
                </div>
                {item.assignedEmployeeName && (
                  <div style={{ fontSize: "12px", color: "var(--success)" }}>
                    ✓ Assigned: {item.assignedEmployeeName}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
              >
                <div>Exp: {item.experience} years</div>
                <div>Education: {item.education}</div>
                <div>Status: {item.itemStatus}</div>
              </div>

              {item.itemStatus === "Pending" && selectedItem === item.id && (
                <div style={{ marginTop: "12px" }}>
                  <button
                    className="action-button primary"
                    style={{ fontSize: "12px", padding: "8px 16px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // In real app, this would open a modal with employee selection
                      const matchedEmployee = employees.find(
                        (emp) =>
                          emp.skill.includes(item.skill.split(" ")[0] ?? "") &&
                          emp.level === item.level,
                      );
                      if (matchedEmployee) {
                        onAssignEmployee?.(item.id, matchedEmployee.id);
                      }
                    }}
                  >
                    <UserPlus size={12} />
                    Map Resource
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Employee Suggestions */}
      <div
        style={{
          backgroundColor: "var(--bg-primary)",
          borderRadius: "16px",
          padding: "24px",
          border: "1px solid var(--border-subtle)",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 600 }}>
            <Users
              size={16}
              style={{ marginRight: "8px", verticalAlign: "middle" }}
            />
            Suggested Employees
          </h3>
          <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
            {employees.length} matches found
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {employees.map((employee) => (
            <div
              key={employee.id}
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid var(--border-subtle)",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <strong style={{ fontSize: "14px" }}>{employee.name}</strong>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginTop: "2px",
                    }}
                  >
                    {employee.skill} • {employee.level} • {employee.department}
                  </div>
                </div>
                <div
                  style={{
                    padding: "4px 8px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: 600,
                    background:
                      employee.availability === "Available"
                        ? "rgba(16, 185, 129, 0.1)"
                        : "rgba(245, 158, 11, 0.1)",
                    color:
                      employee.availability === "Available"
                        ? "var(--success)"
                        : "var(--warning)",
                  }}
                >
                  {employee.availability}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                  marginBottom: "12px",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
              >
                <div>📍 {employee.location}</div>
                <div>📊 {employee.experience} years exp</div>
                <div style={{ textAlign: "right" }}>
                  <strong style={{ color: "var(--primary-accent)" }}>
                    {employee.matchScore}% match
                  </strong>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{ fontSize: "11px", color: "var(--text-tertiary)" }}
                >
                  ID: {employee.id}
                </div>
                <button
                  className="action-button primary"
                  style={{ fontSize: "11px", padding: "6px 12px" }}
                  onClick={() => {
                    if (selectedItem) {
                      onAssignEmployee(selectedItem, employee.id);
                    }
                  }}
                  disabled={!selectedItem}
                >
                  Assign to Selected Position
                </button>
              </div>
            </div>
          ))}
        </div>

        {selectedItem && (
          <div
            style={{
              marginTop: "24px",
              padding: "16px",
              backgroundColor: "rgba(59, 130, 246, 0.05)",
              borderRadius: "12px",
              border: "1px solid rgba(59, 130, 246, 0.1)",
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
              <AlertCircle size={14} color="var(--primary-accent)" />
              <strong style={{ fontSize: "12px" }}>Assignment Logic</strong>
            </div>
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
              }}
            >
              When you assign an employee to a requisition item, the{" "}
              <code>assigned_emp_id</code> field in the{" "}
              <code>requisition_items</code> table will be updated, and the item
              status will change to "Fulfilled". The requisition will remain
              open until all items are fulfilled or cancelled.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/* ======================================================
   Main Component
   ====================================================== */

const HrRequisitions: React.FC<HrRequisitionsProps> = ({
  currentUser = "Current User",
  onAssignRequisition,
  onAssignEmployee,
  onViewRequisition,
}) => {
  const [requisitions, setRequisitions] =
    useState<Requisition[]>(mockRequisitions);
  const [employees] = useState<EmployeeMatch[]>(mockEmployees);
  const [selectedRequisition, setSelectedRequisition] =
    useState<Requisition | null>(null);
  const [activeFilter, setActiveFilter] = useState<
    "all" | "assigned" | "unassigned" | "my"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter requisitions based on active filter
  const filteredRequisitions = requisitions
    .filter((req) => {
      if (activeFilter === "assigned") return req.assignedTA;
      if (activeFilter === "unassigned") return !req.assignedTA;
      if (activeFilter === "my") return req.assignedTA === currentUser;
      return true;
    })
    .filter(
      (req) =>
        req.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.client.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const handleAssignRequisition = (reqId: string) => {
    // In a real app, this would show a modal or dropdown to select TA
    setRequisitions((prev) =>
      prev.map((req) =>
        req.id === reqId ? { ...req, assignedTA: currentUser } : req,
      ),
    );
    onAssignRequisition?.(reqId, currentUser);
  };

  const handleAssignEmployee = (itemId: string, empId: string) => {
    const employee = employees.find((emp) => emp.id === empId);
    if (!employee || !selectedRequisition) return;

    // Update the requisition item
    const updatedRequisitions = requisitions.map((req) => {
      if (req.id === selectedRequisition.id) {
        return {
          ...req,
          items: req.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  itemStatus: "Fulfilled" as const,
                  assignedEmployeeId: empId,
                  assignedEmployeeName: employee.name,
                }
              : item,
          ),
        };
      }
      return req;
    });

    setRequisitions(updatedRequisitions);
    setSelectedRequisition(
      updatedRequisitions.find((req) => req.id === selectedRequisition.id) ||
        null,
    );
    onAssignEmployee?.(itemId, empId);

    // Check if all items are now fulfilled/cancelled
    const updatedReq = updatedRequisitions.find(
      (req) => req.id === selectedRequisition.id,
    );
    if (updatedReq) {
      const allItemsDone = updatedReq.items.every(
        (item) =>
          item.itemStatus === "Fulfilled" || item.itemStatus === "Cancelled",
      );
      if (allItemsDone) {
        setRequisitions((prev) =>
          prev.map((req) =>
            req.id === selectedRequisition.id
              ? { ...req, overallStatus: "Closed" as const }
              : req,
          ),
        );
      }
    }
  };

  const handleViewRequisition = (reqId: string) => {
    onViewRequisition?.(reqId);
  };

  return (
    <>
      {/* Header */}
      <div className="manager-header">
        <h2>HR Recruitment Dashboard</h2>
        <p className="subtitle">
          Talent Acquisition Portal - Manage requisitions and match resources
        </p>
      </div>

      {/* KPI Cards */}
      <HrKpiCards requisitions={requisitions} />

      {/* Filter Chips */}
      <div className="filter-chips" style={{ marginBottom: "24px" }}>
        <button
          className={`filter-chip ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          <Filter size={12} style={{ marginRight: "6px" }} />
          All Requisitions ({requisitions.length})
        </button>
        <button
          className={`filter-chip ${activeFilter === "unassigned" ? "active" : ""}`}
          onClick={() => setActiveFilter("unassigned")}
        >
          <AlertCircle size={12} style={{ marginRight: "6px" }} />
          Unassigned ({requisitions.filter((r) => !r.assignedTA).length})
        </button>
        <button
          className={`filter-chip ${activeFilter === "assigned" ? "active" : ""}`}
          onClick={() => setActiveFilter("assigned")}
        >
          <CheckCircle size={12} style={{ marginRight: "6px" }} />
          Assigned Tickets ({requisitions.filter((r) => r.assignedTA).length})
        </button>
        <button
          className={`filter-chip ${activeFilter === "my" ? "active" : ""}`}
          onClick={() => setActiveFilter("my")}
        >
          <Users size={12} style={{ marginRight: "6px" }} />
          My Assignments (
          {requisitions.filter((r) => r.assignedTA === currentUser).length})
        </button>
      </div>

      {/* Search and Filters */}
      <div className="log-filters" style={{ marginBottom: "28px" }}>
        <div className="filter-group">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by ID, project, or client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
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
              <label>Aging</label>
              <select>
                <option>All</option>
                <option>0–7 days</option>
                <option>8–30 days</option>
                <option>30+ days</option>
              </select>
            </div>
            <div className="filter-item">
              <label>Client</label>
              <select>
                <option>All Clients</option>
                <option>FinTech Corp</option>
                <option>Global Bank</option>
                <option>Data Insights Inc</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedRequisition ? "1fr 1.5fr" : "1fr",
          gap: "24px",
        }}
      >
        {/* Requisitions Table */}
        <div>
          <div className="ticket-table-container">
            <table className="ticket-table">
              <thead>
                <tr>
                  <th>Req ID</th>
                  <th>Project / Client</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Days Open</th>
                  <th>Assigned TA</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredRequisitions.map((req) => {
                  const agingDays = getAgingDays(req.dateCreated);
                  const completion = calculateCompletion(req.items);
                  const isAssignedToMe = req.assignedTA === currentUser;

                  return (
                    <tr
                      key={req.id}
                      style={{
                        background:
                          selectedRequisition?.id === req.id
                            ? "rgba(59, 130, 246, 0.05)"
                            : "inherit",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setSelectedRequisition(req);
                        handleViewRequisition(req.id);
                      }}
                    >
                      <td>
                        <strong>{req.id}</strong>
                      </td>

                      <td>
                        <div
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          <strong>{req.project}</strong>
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--text-tertiary)",
                            }}
                          >
                            {req.client}
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
                            }}
                          >
                            <span
                              className={`status-badge ${completion.pending > 0 ? "inactive" : "active"}`}
                            >
                              {completion.pending} pending
                            </span>
                            <span
                              style={{
                                fontSize: "11px",
                                color: "var(--text-tertiary)",
                              }}
                            >
                              ({completion.fulfilled}/{completion.total})
                            </span>
                          </div>
                          <div
                            style={{
                              height: "3px",
                              background: "var(--border-subtle)",
                              borderRadius: "2px",
                              overflow: "hidden",
                              width: "80px",
                            }}
                          >
                            <div
                              style={{
                                width: `${completion.progress}%`,
                                height: "100%",
                                background:
                                  completion.progress === 100
                                    ? "var(--success)"
                                    : "var(--primary-accent)",
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={getStatusClass(req.overallStatus)}>
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
                        <span
                          className={`aging-indicator ${getAgingClass(agingDays)}`}
                        >
                          {agingDays} days
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
                                background: isAssignedToMe
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
                        {!req.assignedTA ? (
                          <button
                            className="action-button primary"
                            style={{ fontSize: "11px", padding: "6px 12px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAssignRequisition(req.id);
                            }}
                          >
                            Assign to TA
                          </button>
                        ) : isAssignedToMe ? (
                          <button
                            className="action-button"
                            style={{ fontSize: "11px", padding: "6px 12px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRequisition(req);
                            }}
                          >
                            Manage
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-tertiary)",
                            }}
                          >
                            Assigned
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredRequisitions.length === 0 && (
                  <tr>
                    <td colSpan={8}>
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

          {/* Quick Stats */}
          <div
            style={{
              marginTop: "20px",
              padding: "16px",
              backgroundColor: "var(--bg-tertiary)",
              borderRadius: "12px",
              fontSize: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <strong>
                  Showing {filteredRequisitions.length} of {requisitions.length}{" "}
                  requisitions
                </strong>
              </div>
              <div>
                <span
                  style={{ marginRight: "16px", color: "var(--text-tertiary)" }}
                >
                  ⚠ {requisitions.filter((r) => !r.assignedTA).length}{" "}
                  unassigned
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>
                  ⏱ Avg aging:{" "}
                  {Math.round(
                    requisitions.reduce(
                      (sum, req) => sum + getAgingDays(req.dateCreated),
                      0,
                    ) / requisitions.length,
                  )}{" "}
                  days
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Matchmaking Panel */}
        {selectedRequisition && (
          <div
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderRadius: "16px",
              padding: "24px",
              border: "1px solid var(--border-subtle)",
              height: "calc(100vh - 300px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    marginBottom: "4px",
                  }}
                >
                  Matchmaking for {selectedRequisition.id}
                </h3>
                <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                  Assign resources to requisition items - Work item by item
                </p>
              </div>
              <button
                className="action-button"
                onClick={() => setSelectedRequisition(null)}
                style={{ fontSize: "12px", padding: "8px 12px" }}
              >
                Close Panel
              </button>
            </div>

            <div style={{ flex: 1, overflow: "hidden" }}>
              <MatchmakingPanel
                requisition={selectedRequisition}
                employees={employees}
                onAssignEmployee={handleAssignEmployee}
              />
            </div>
          </div>
        )}
      </div>

      {/* Workflow Note */}
      {!selectedRequisition && (
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
              marginBottom: "8px",
            }}
          >
            <AlertCircle size={16} color="var(--primary-accent)" />
            <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
              HR Workflow Guide
            </strong>
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            <p>
              1. <strong>Assign yourself to unassigned requisitions</strong> (or
              assign to specific TAs if admin)
            </p>
            <p>
              2.{" "}
              <strong>Click on a requisition to open matchmaking panel</strong>{" "}
              - see all pending positions on the left
            </p>
            <p>
              3. <strong>Select a position and assign an employee</strong> -
              suggested matches appear on the right
            </p>
            <p>
              4. <strong>Work item by item</strong> - The requisition closes
              automatically when all items are fulfilled or cancelled
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default HrRequisitions;
