import React, { useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Users,
  Target,
  Clock,
  CheckCircle,
  FileText,
  MessageSquare,
  History,
  Download,
  Printer,
  ExternalLink,
  Shield,
  Edit,
  Save,
  X,
  UserPlus,
  Search,
  Filter,
  AlertCircle,
  Briefcase,
  Award,
  GraduationCap,
  MapPin,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";

interface RequisitionDetailsProps {
  requisitionId?: string | null;
  onBack?: () => void;
  onUpdate?: (ticket: any) => void;
}

interface Employee {
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

interface RequisitionItem {
  id: string;
  skill: string;
  level: string;
  experience: number;
  education: string;
  itemStatus: "Pending" | "Fulfilled" | "Cancelled";
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  assignedDate?: string;
  description: string;
}

const RequisitionDetail: React.FC<RequisitionDetailsProps> = ({
  requisitionId,
  onBack,
  onUpdate,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const effectiveTicketId = requisitionId ?? id;
  const getTodayDate = () =>
    new Date().toISOString().split("T")[0] ?? new Date().toISOString();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "items" | "employees" | "timeline"
  >("overview");
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [selectedItemForAssignment, setSelectedItemForAssignment] = useState<
    string | null
  >(null);
  const [newNote, setNewNote] = useState("");

  // Mock ticket data with requisition items
  const [ticket, setTicket] = useState({
    id: effectiveTicketId || "REQ-2024-001",
    ticketId: effectiveTicketId || "REQ-2024-001",
    projectName: "E-Commerce Platform",
    projectCode: "ECOM-2024",
    client: "Retail Giant Inc",
    projectManager: "Rajesh Kumar",
    requiredBy: "2024-04-15",
    workMode: "Hybrid",
    location: "Bengaluru",
    priority: "High" as "High" | "Medium" | "Low",
    overallStatus: "In Progress" as "Open" | "In Progress" | "Closed",
    justification: `Need 2 Senior Python developers with Django/Flask experience for our new E-commerce platform migration project. Must have experience with microservices architecture and AWS services. Project duration: 6 months with possible extension.`,

    // Detailed information
    dateCreated: "2024-01-01",
    assignedTA: "Anita Sharma",
    daysOpen: 15,
    slaHours: 72,
    budget: "₹15,00,000",
    projectDuration: "6 months",

    // Requisition Items
    items: [
      {
        id: "ITEM-001",
        skill: "Python Developer",
        level: "Senior",
        experience: 7,
        education: "B.Tech/M.Tech",
        itemStatus: "Pending" as "Pending" | "Fulfilled" | "Cancelled",
        description:
          "Lead backend development with Python/Django, AWS services, microservices architecture",
      },
      {
        id: "ITEM-002",
        skill: "React Developer",
        level: "Mid",
        experience: 4,
        education: "B.E",
        itemStatus: "Pending" as "Pending" | "Fulfilled" | "Cancelled",
        description: "Frontend development with React, Redux, TypeScript",
      },
      {
        id: "ITEM-003",
        skill: "DevOps Engineer",
        level: "Senior",
        experience: 6,
        education: "B.Tech",
        itemStatus: "Fulfilled" as "Pending" | "Fulfilled" | "Cancelled",
        assignedEmployeeId: "EMP-112",
        assignedEmployeeName: "Neha Verma",
        assignedDate: "2024-01-10",
        description: "CI/CD pipeline, AWS infrastructure, Docker, Kubernetes",
      },
    ] as RequisitionItem[],

    // Available employees for assignment
    availableEmployees: [
      {
        id: "EMP-078",
        name: "Arun Verma",
        skill: "Python Developer",
        level: "Senior",
        experience: 8,
        location: "Bengaluru",
        availability: "Available" as const,
        matchScore: 92,
        department: "Engineering",
      },
      {
        id: "EMP-045",
        name: "Vikram Singh",
        skill: "Python Developer",
        level: "Senior",
        experience: 8,
        location: "Delhi",
        availability: "On Project" as const,
        matchScore: 85,
        department: "Backend",
      },
      {
        id: "EMP-112",
        name: "Neha Sharma",
        skill: "React Developer",
        level: "Mid",
        experience: 5,
        location: "Mumbai",
        availability: "Available" as const,
        matchScore: 88,
        department: "Frontend",
      },
    ] as Employee[],

    // Activity timeline
    timeline: [
      { date: "2024-01-01", event: "Requisition Created", user: "System" },
      { date: "2024-01-03", event: "Assigned to TA Team", user: "HR Manager" },
      {
        date: "2024-01-05",
        event: "Skills Analysis Completed",
        user: "HR Analytics",
      },
      {
        date: "2024-01-10",
        event: "DevOps Position Fulfilled",
        user: "Anita Sharma",
      },
    ],

    // Notes & Comments
    notes: [
      {
        date: "2024-01-02",
        user: "HR Manager",
        text: "Bench analysis shows 3 available resources with matching skills",
      },
      {
        date: "2024-01-04",
        user: "TA Lead",
        text: "External sourcing initiated for backup candidates",
      },
      {
        date: "2024-01-11",
        user: "Anita Sharma",
        text: "Assigned Neha Verma to DevOps position. Two positions remaining.",
      },
    ],
  });

  // Calculate completion stats
  const completionStats = {
    totalItems: ticket.items.length,
    fulfilled: ticket.items.filter((item) => item.itemStatus === "Fulfilled")
      .length,
    pending: ticket.items.filter((item) => item.itemStatus === "Pending")
      .length,
    cancelled: ticket.items.filter((item) => item.itemStatus === "Cancelled")
      .length,
    progress: Math.round(
      (ticket.items.filter(
        (item) =>
          item.itemStatus === "Fulfilled" || item.itemStatus === "Cancelled",
      ).length /
        ticket.items.length) *
        100,
    ),
  };

  // Handle item status change
  const handleItemStatusChange = (
    itemId: string,
    newStatus: RequisitionItem["itemStatus"],
  ) => {
    const updatedItems = ticket.items.map((item) =>
      item.id === itemId ? { ...item, itemStatus: newStatus } : item,
    );
    setTicket({ ...ticket, items: updatedItems });

    // Update overall status if all items are done
    const allItemsDone = updatedItems.every(
      (item) =>
        item.itemStatus === "Fulfilled" || item.itemStatus === "Cancelled",
    );
    if (allItemsDone) {
      setTicket((prev) => ({ ...prev, overallStatus: "Closed" }));
    }
  };

  // Handle employee assignment
  const handleAssignEmployee = (itemId: string, employeeId: string) => {
    const employee = ticket.availableEmployees.find(
      (emp) => emp.id === employeeId,
    );
    if (!employee) return;

    const updatedItems = ticket.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            itemStatus: "Fulfilled" as const,
            assignedEmployeeId: employeeId,
            assignedEmployeeName: employee.name,
            assignedDate: getTodayDate(),
          }
        : item,
    );

    setTicket({ ...ticket, items: updatedItems });
    setSelectedItemForAssignment(null);

    // Add to timeline
    setTicket((prev) => ({
      ...prev,
      timeline: [
        ...prev.timeline,
        {
          date: getTodayDate(),
          event: `Assigned ${employee.name} to ${prev.items.find((i) => i.id === itemId)?.skill ?? "resource"}`,
          user: "Current User",
        },
      ],
    }));

    if (onUpdate) {
      onUpdate({ ...ticket, items: updatedItems });
    }
  };

  // Toggle item expansion
  const toggleItemExpansion = (itemId: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  // Save changes
  const handleSave = () => {
    setIsEditing(false);
    if (onUpdate) {
      onUpdate(ticket);
    }
  };

  // Cancel editing
  const handleCancel = () => {
    setIsEditing(false);
  };

  // Add new note
  const handleAddNote = () => {
    if (!newNote.trim()) return;

    const newNoteObj = {
      date: getTodayDate(),
      user: "Current User",
      text: newNote,
    };

    setTicket((prev) => ({
      ...prev,
      notes: [...prev.notes, newNoteObj],
    }));
    setNewNote("");
  };

  // Tabs
  const tabs = [
    {
      id: "overview" as const,
      label: "Overview",
      icon: <FileText size={16} />,
    },
    {
      id: "items" as const,
      label: "Requisition Items",
      icon: <Briefcase size={16} />,
    },
    {
      id: "employees" as const,
      label: "Available Employees",
      icon: <Users size={16} />,
    },
    { id: "timeline" as const, label: "Timeline", icon: <History size={16} /> },
  ];

  return (
    <div className="admin-content-area">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            onClick={() => (onBack ? onBack() : navigate("/hr/requisitions"))}
            className="action-button"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <ArrowLeft size={16} />
            Back to Requisitions
          </button>
          <div>
            <h1
              style={{ fontSize: "20px", fontWeight: 600, marginBottom: "2px" }}
            >
              Requisition Details
            </h1>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
              Manage and update resource requirements - HR/TA View
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {!isEditing ? (
            <button
              className="action-button primary"
              onClick={() => setIsEditing(true)}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Edit size={16} />
              Edit Requisition
            </button>
          ) : (
            <>
              <button
                className="action-button"
                onClick={handleCancel}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <X size={16} />
                Cancel
              </button>
              <button
                className="action-button primary"
                onClick={handleSave}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Save size={16} />
                Save Changes
              </button>
            </>
          )}
          {/* <button className="action-button">
            <Download size={16} />
          </button>
          <button className="action-button">
            <Printer size={16} />
          </button> */}
        </div>
      </div>

      {/* Status & Progress */}
      <div
        style={{
          padding: "20px",
          marginBottom: "24px",
          backgroundColor: "var(--bg-primary)",
          borderRadius: "16px",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                fontFamily: "monospace",
              }}
            >
              {ticket.ticketId}
            </div>
            <span
              className={`ticket-status ${ticket.overallStatus.toLowerCase().replace(" ", "-")}`}
            >
              {ticket.overallStatus}
            </span>
            <span
              className={`priority-indicator priority-${ticket.priority.toLowerCase()}`}
            >
              {ticket.priority} Priority
            </span>
            <span
              className={`aging-indicator ${ticket.daysOpen <= 7 ? "aging-0-7" : ticket.daysOpen <= 30 ? "aging-8-30" : "aging-30-plus"}`}
            >
              {ticket.daysOpen} days open
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
            Required by: {ticket.requiredBy}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 500 }}>
              Completion Progress
            </span>
            <span style={{ fontSize: "14px", fontWeight: 600 }}>
              {completionStats.progress}%
            </span>
          </div>
          <div
            style={{
              height: "8px",
              background: "var(--border-subtle)",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${completionStats.progress}%`,
                height: "100%",
                background:
                  "linear-gradient(135deg, var(--primary-accent), var(--primary-accent-dark))",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "8px",
              fontSize: "12px",
              color: "var(--text-tertiary)",
            }}
          >
            <span> {completionStats.fulfilled} Fulfilled</span>
            <span> {completionStats.pending} Pending</span>
            <span> {completionStats.cancelled} Cancelled</span>
            <span> {completionStats.totalItems} Total Positions</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "24px",
          padding: "4px",
          backgroundColor: "var(--bg-tertiary)",
          borderRadius: "12px",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: "8px",
              border: "none",
              background:
                activeTab === tab.id ? "var(--bg-primary)" : "transparent",
              color:
                activeTab === tab.id
                  ? "var(--text-primary)"
                  : "var(--text-tertiary)",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s ease",
              boxShadow: activeTab === tab.id ? "var(--shadow-sm)" : "none",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content based on active tab */}
      {activeTab === "overview" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: "24px",
          }}
        >
          {/* Left Column - Basic Info */}
          <div>
            <div className="master-data-manager">
              <div className="data-manager-header">
                <h2>Project & Client Details</h2>
                <p className="subtitle">
                  Complete project information and requirements
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "24px",
                  marginBottom: "24px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: "12px",
                    }}
                  >
                    Project Information
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Project Name:
                      </span>
                      <span style={{ fontWeight: 500 }}>
                        {ticket.projectName}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      {/* <span style={{ color: "var(--text-secondary)" }}>
                        Project Code:
                      </span>
                      <span style={{ fontFamily: "monospace" }}>
                        {ticket.projectCode}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    > */}
                      <span style={{ color: "var(--text-secondary)" }}>
                        Client:
                      </span>
                      <span style={{ fontWeight: 500 }}>{ticket.client}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Project Manager:
                      </span>
                      <span>{ticket.projectManager}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: "12px",
                    }}
                  >
                    Logistics
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Work Mode:
                      </span>
                      <span style={{ fontWeight: 500 }}>{ticket.workMode}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Location:
                      </span>
                      <span>{ticket.location}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Project Duration:
                      </span>
                      <span>{ticket.projectDuration}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Budget:
                      </span>
                      <span style={{ fontWeight: 500 }}>{ticket.budget}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: "8px",
                  }}
                >
                  Business Justification
                </div>
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "var(--bg-secondary)",
                    borderRadius: "12px",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <p
                    style={{
                      color: "var(--text-primary)",
                      lineHeight: 1.5,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {ticket.justification}
                  </p>
                </div>
              </div>

              {/* Assignment Info */}
              <div
                style={{
                  padding: "20px",
                  backgroundColor: "var(--bg-tertiary)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: "12px",
                  }}
                >
                  Assignment Details
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "4px",
                      }}
                    >
                      <Users size={14} />
                      <span style={{ color: "var(--text-secondary)" }}>
                        Assigned TA:
                      </span>
                    </div>
                    <span style={{ fontWeight: 500 }}>{ticket.assignedTA}</span>
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "4px",
                      }}
                    >
                      <Calendar size={14} />
                      <span style={{ color: "var(--text-secondary)" }}>
                        Date Created:
                      </span>
                    </div>
                    <span>{ticket.dateCreated}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Quick Stats & Actions */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
          >
            {/* Quick Stats */}
            <div className="audit-log-viewer">
              <div className="viewer-header">
                <h2>Quick Stats</h2>
                <p className="subtitle">Requisition metrics at a glance</p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  marginTop: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    SLA Status
                  </span>
                  <span
                    className={`sla-timer ${ticket.daysOpen > 10 ? "critical" : "warning"}`}
                  >
                    {ticket.slaHours - ticket.daysOpen * 24}h remaining
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Match Rate
                  </span>
                  <span style={{ color: "var(--success)", fontWeight: 600 }}>
                    85%
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Bench Availability
                  </span>
                  <span style={{ color: "var(--success)", fontWeight: 600 }}>
                    3 resources
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Avg. Time to Fill
                  </span>
                  <span>18 days</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="audit-log-viewer">
              <div className="viewer-header">
                <h2>Quick Actions</h2>
                <p className="subtitle">TA operations</p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  marginTop: "16px",
                }}
              >
                {/* <button
                  className="action-button"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => setActiveTab("employees")}
                >
                  <Users size={16} />
                  View Available Employees
                </button> */}
                {/* <button
                  className="action-button"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => setActiveTab("items")}
                >
                  <Briefcase size={16} />
                  Manage Requisition Items
                </button> */}
                <button
                  className="action-button"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                >
                  <MessageSquare size={16} />
                  Add Internal Note
                </button>
                {/* <button
                  className="action-button primary"
                  style={{ justifyContent: "center" }}
                >
                  <ExternalLink size={16} />
                  Generate Onboarding Plan
                </button> */}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "items" && (
        <div className="master-data-manager">
          <div className="data-manager-header">
            <h2>Requisition Items Management</h2>
            <p className="subtitle">
              Manage individual positions - Update status or assign resources
            </p>
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {ticket.items.map((item) => {
              const isExpanded = expandedItems.includes(item.id);
              const matchedEmployees = ticket.availableEmployees
                .filter(
                  (emp) =>
                    emp.skill.includes(item.skill.split(" ")[0] ?? "") &&
                    emp.level === item.level,
                )
                .sort((a, b) => b.matchScore - a.matchScore);

              return (
                <div
                  key={item.id}
                  style={{
                    padding: "20px",
                    backgroundColor: "var(--bg-primary)",
                    borderRadius: "12px",
                    border:
                      selectedItemForAssignment === item.id
                        ? "2px solid var(--primary-accent)"
                        : "1px solid var(--border-subtle)",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "16px",
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
                        <span
                          className={
                            item.itemStatus === "Pending"
                              ? "ticket-status open"
                              : item.itemStatus === "Fulfilled"
                                ? "ticket-status fulfilled"
                                : "ticket-status closed"
                          }
                        >
                          {item.itemStatus}
                        </span>
                        <strong style={{ fontSize: "15px" }}>
                          {item.skill} ({item.level})
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "16px",
                          fontSize: "12px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        <span>📊 {item.experience} years exp</span>
                        <span>🎓 {item.education}</span>
                        <span>
                          {item.assignedEmployeeName
                            ? `👤 Assigned: ${item.assignedEmployeeName}`
                            : "👤 Unassigned"}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {item.itemStatus === "Pending" && (
                        <button
                          className="action-button primary"
                          style={{
                            fontSize: "12px",
                            padding: "8px 12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                          onClick={() =>
                            setSelectedItemForAssignment(
                              selectedItemForAssignment === item.id
                                ? null
                                : item.id,
                            )
                          }
                        >
                          <UserPlus size={12} />
                          {selectedItemForAssignment === item.id
                            ? "Cancel"
                            : "Assign Employee"}
                        </button>
                      )}

                      {isEditing && (
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            className="action-button"
                            style={{ fontSize: "11px", padding: "6px 10px" }}
                            onClick={() =>
                              handleItemStatusChange(item.id, "Fulfilled")
                            }
                            disabled={item.itemStatus === "Fulfilled"}
                          >
                            Mark Fulfilled
                          </button>
                          <button
                            className="action-button"
                            style={{ fontSize: "11px", padding: "6px 10px" }}
                            onClick={() =>
                              handleItemStatusChange(item.id, "Cancelled")
                            }
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      <button
                        className="action-button"
                        style={{
                          width: "32px",
                          height: "32px",
                          padding: "0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onClick={() => toggleItemExpansion(item.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: "16px",
                        paddingTop: "16px",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--text-secondary)",
                          marginBottom: "12px",
                        }}
                      >
                        {item.description}
                      </div>

                      {selectedItemForAssignment === item.id && (
                        <div
                          style={{
                            marginTop: "16px",
                            padding: "16px",
                            backgroundColor: "var(--bg-secondary)",
                            borderRadius: "8px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              marginBottom: "12px",
                            }}
                          >
                            Available Matches ({matchedEmployees.length})
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            {matchedEmployees.map((emp) => (
                              <div
                                key={emp.id}
                                style={{
                                  padding: "12px",
                                  backgroundColor: "var(--bg-primary)",
                                  borderRadius: "8px",
                                  border: "1px solid var(--border-subtle)",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 500 }}>
                                    {emp.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--text-tertiary)",
                                    }}
                                  >
                                    {emp.department} • {emp.location} •{" "}
                                    {emp.experience}y exp
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                  }}
                                >
                                  <span
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: "12px",
                                      fontSize: "11px",
                                      background:
                                        emp.availability === "Available"
                                          ? "rgba(16, 185, 129, 0.1)"
                                          : "rgba(245, 158, 11, 0.1)",
                                      color:
                                        emp.availability === "Available"
                                          ? "var(--success)"
                                          : "var(--warning)",
                                    }}
                                  >
                                    {emp.availability}
                                  </span>
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      color: "var(--primary-accent)",
                                    }}
                                  >
                                    {emp.matchScore}% match
                                  </span>
                                  <button
                                    className="action-button primary"
                                    style={{
                                      fontSize: "11px",
                                      padding: "6px 12px",
                                    }}
                                    onClick={() =>
                                      handleAssignEmployee(item.id, emp.id)
                                    }
                                  >
                                    Assign
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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
              <strong
                style={{ fontSize: "13px", color: "var(--text-primary)" }}
              >
                Workflow Note
              </strong>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              Each requisition item represents one position. When you assign an
              employee, the item status changes to "Fulfilled". The overall
              requisition will close automatically when all items are either
              "Fulfilled" or "Cancelled".
            </p>
          </div>
        </div>
      )}

      {activeTab === "employees" && (
        <div className="master-data-manager">
          <div className="data-manager-header">
            <h2>Available Employees</h2>
            <p className="subtitle">
              Match resources to open positions based on skills and availability
            </p>
          </div>

          {/* Search and Filter */}
          <div className="filter-grid" style={{ marginBottom: "24px" }}>
            <div className="filter-item">
              <label>Skill Match</label>
              <select style={{ width: "100%" }}>
                <option>All Skills</option>
                <option>Python Developer</option>
                <option>React Developer</option>
                <option>DevOps Engineer</option>
              </select>
            </div>
            <div className="filter-item">
              <label>Availability</label>
              <select style={{ width: "100%" }}>
                <option>All Status</option>
                <option>Available</option>
                <option>On Project</option>
                <option>On Notice</option>
              </select>
            </div>
            <div className="filter-item">
              <label>Location</label>
              <select style={{ width: "100%" }}>
                <option>All Locations</option>
                <option>Bengaluru</option>
                <option>Mumbai</option>
                <option>Delhi</option>
                <option>Pune</option>
              </select>
            </div>
            <div className="filter-item">
              <label>Experience Level</label>
              <select style={{ width: "100%" }}>
                <option>All Levels</option>
                <option>Junior (0-2y)</option>
                <option>Mid (2-5y)</option>
                <option>Senior (5-8y)</option>
                <option>Lead (8+y)</option>
              </select>
            </div>
          </div>

          {/* Employees List */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {ticket.availableEmployees.map((emp) => {
              const openItems = ticket.items.filter(
                (item) =>
                  item.itemStatus === "Pending" &&
                  item.skill.includes(emp.skill.split(" ")[0] ?? "") &&
                  item.level === emp.level,
              );

              return (
                <div
                  key={emp.id}
                  style={{
                    padding: "20px",
                    backgroundColor: "var(--bg-primary)",
                    borderRadius: "12px",
                    border: "1px solid var(--border-subtle)",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "16px",
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
                        <div
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "8px",
                            background:
                              "linear-gradient(135deg, var(--slate-600), var(--slate-700))",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 600,
                            fontSize: "14px",
                          }}
                        >
                          {emp.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <div style={{ fontSize: "15px", fontWeight: 600 }}>
                            {emp.name}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {emp.skill} • {emp.level} • {emp.department}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "16px",
                          fontSize: "12px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        <span>📍 {emp.location}</span>
                        <span>📊 {emp.experience} years exp</span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "12px",
                            background:
                              emp.availability === "Available"
                                ? "rgba(16, 185, 129, 0.1)"
                                : emp.availability === "On Notice"
                                  ? "rgba(245, 158, 11, 0.1)"
                                  : "rgba(100, 116, 139, 0.1)",
                            color:
                              emp.availability === "Available"
                                ? "var(--success)"
                                : emp.availability === "On Notice"
                                  ? "var(--warning)"
                                  : "var(--slate-500)",
                          }}
                        >
                          {emp.availability}
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: "20px",
                          fontWeight: 700,
                          color: "var(--primary-accent)",
                        }}
                      >
                        {emp.matchScore}%
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        Match Score
                      </div>
                    </div>
                  </div>

                  {/* Matching Positions */}
                  {openItems.length > 0 && (
                    <div
                      style={{
                        marginTop: "16px",
                        paddingTop: "16px",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          marginBottom: "8px",
                        }}
                      >
                        Matching Open Positions ({openItems.length})
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {openItems.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              padding: "10px 12px",
                              backgroundColor: "var(--bg-secondary)",
                              borderRadius: "8px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div
                                style={{ fontWeight: 500, fontSize: "13px" }}
                              >
                                {item.skill}
                              </div>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "var(--text-tertiary)",
                                }}
                              >
                                {item.level} • {item.experience}y exp •{" "}
                                {item.education}
                              </div>
                            </div>
                            <button
                              className="action-button primary"
                              style={{ fontSize: "11px", padding: "6px 12px" }}
                              onClick={() =>
                                handleAssignEmployee(item.id, emp.id)
                              }
                            >
                              Assign to Position
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="master-data-manager">
          <div className="data-manager-header">
            <h2>Activity Timeline</h2>
            <p className="subtitle">
              Complete history of requisition updates and assignments
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              marginTop: "24px",
            }}
          >
            {ticket.timeline.map((item, idx) => (
              <div key={idx} style={{ display: "flex", gap: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: "var(--bg-tertiary)",
                      border: "2px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <History size={14} />
                  </div>
                  {idx !== ticket.timeline.length - 1 && (
                    <div
                      style={{
                        width: "2px",
                        height: "100%",
                        background: "var(--border-subtle)",
                        marginTop: "8px",
                      }}
                    ></div>
                  )}
                </div>
                <div
                  style={{
                    flex: 1,
                    paddingBottom:
                      idx !== ticket.timeline.length - 1 ? "24px" : "0",
                  }}
                >
                  <div
                    style={{
                      padding: "16px",
                      backgroundColor: "var(--bg-secondary)",
                      borderRadius: "12px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "8px",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{item.event}</div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        {item.date}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Updated by <strong>{item.user}</strong>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add New Event (if editing) */}
          {isEditing && (
            <div
              style={{
                marginTop: "32px",
                paddingTop: "24px",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "12px",
                }}
              >
                Add Timeline Entry
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <input
                  type="text"
                  placeholder="Event description..."
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                  }}
                />
                <button className="action-button primary">Add Entry</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes Section */}
      <div className="master-data-manager" style={{ marginTop: "24px" }}>
        <div className="data-manager-header">
          <h2>Notes & Comments</h2>
          <p className="subtitle">Internal communication and updates</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {ticket.notes.map((note, idx) => (
            <div
              key={idx}
              style={{
                padding: "16px",
                backgroundColor: "var(--bg-secondary)",
                borderRadius: "12px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: "var(--primary-accent)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    {note.user
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{note.user}</div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {note.date}
                    </div>
                  </div>
                </div>
                {isEditing && (
                  <button
                    className="action-button"
                    style={{ fontSize: "11px", padding: "4px 8px" }}
                  >
                    Edit
                  </button>
                )}
              </div>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-primary)",
                  lineHeight: 1.5,
                }}
              >
                {note.text}
              </p>
            </div>
          ))}

          {/* Add New Note */}
          {isEditing && (
            <div
              style={{
                padding: "20px",
                backgroundColor: "var(--bg-tertiary)",
                borderRadius: "12px",
                border: "2px dashed var(--border-subtle)",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "12px",
                }}
              >
                Add New Note
              </div>
              <textarea
                placeholder="Enter your note or comment here..."
                rows={3}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-primary)",
                  resize: "vertical",
                  fontSize: "14px",
                  marginBottom: "12px",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                }}
              >
                <button
                  className="action-button"
                  style={{ fontSize: "12px", padding: "8px 16px" }}
                  onClick={() => setNewNote("")}
                >
                  Cancel
                </button>
                <button
                  className="action-button primary"
                  style={{ fontSize: "12px", padding: "8px 16px" }}
                  onClick={handleAddNote}
                >
                  Add Note
                </button>
              </div>
            </div>
          )}

          {/* Summary Stats Card */}
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
                Total Positions
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>
                {completionStats.totalItems}
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
                Fulfilled
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--success)",
                }}
              >
                {completionStats.fulfilled}
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
                Pending
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--warning)",
                }}
              >
                {completionStats.pending}
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
                Completion
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--primary-accent)",
                }}
              >
                {completionStats.progress}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Guidance */}
      {ticket.overallStatus !== "Closed" && (
        <div
          style={{
            marginTop: "24px",
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
                HR Workflow Guidance
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Recommended steps to process this requisition
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
                  Review Open Items
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Check all pending positions in the "Requisition Items" tab
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
                  Match Resources
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Use the "Available Employees" tab to find and assign matches
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
                  Update Status
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Mark items as fulfilled or cancelled as you work through them
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
                  Document Progress
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Add notes in the timeline section to track your progress
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons Footer */}
      <div
        style={{
          marginTop: "32px",
          padding: "20px",
          backgroundColor: "var(--bg-tertiary)",
          borderRadius: "12px",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}
          >
            Requisition Status
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
            Current status:{" "}
            <strong
              style={{
                color:
                  ticket.overallStatus === "Open"
                    ? "#2563eb"
                    : ticket.overallStatus === "In Progress"
                      ? "#d97706"
                      : "#059669",
              }}
            >
              {ticket.overallStatus}
            </strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          {ticket.overallStatus !== "Closed" && (
            <>
              {/* <button
                className="action-button"
                onClick={() => {
                  setTicket((prev) => ({ ...prev, priority: "High" }));
                }}
                style={{
                  fontSize: "12px",
                  padding: "8px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <AlertCircle size={14} />
                Mark as Urgent
              </button> */}

              <button
                className="action-button primary"
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to close this requisition? This action cannot be undone.",
                    )
                  ) {
                    setTicket((prev) => ({ ...prev, overallStatus: "Closed" }));
                  }
                }}
                style={{
                  fontSize: "12px",
                  padding: "8px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <CheckCircle size={14} />
                Close Requisition
              </button>
            </>
          )}

          {/* <button
            className="action-button"
            onClick={() => window.print()}
            style={{
              fontSize: "12px",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Printer size={14} />
            Print Summary
          </button> */}
        </div>
      </div>

      {/* Footer - Audit Trail */}
      <div
        style={{
          marginTop: "32px",
          paddingTop: "20px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "12px",
            color: "var(--text-tertiary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Shield size={14} />
            <span>Audit Trail: All changes are logged for compliance</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Clock size={14} />
            <span>Last updated: Today, 14:30</span>
          </div>
        </div> */}

        {/* <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Target size={14} />
            <span>Requisition ID: {ticket.ticketId}</span>
          </div>
        </div> */}
      </div>

      {/* Help Section */}
      <div
      // style={{
      //   marginTop: "16px",
      //   padding: "12px",
      //   backgroundColor: "var(--bg-secondary)",
      //   borderRadius: "8px",
      //   border: "1px solid var(--border-subtle)",
      //   fontSize: "11px",
      //   color: "var(--text-tertiary)",
      //   textAlign: "center",
      // }}
      >
        <strong></strong>
      </div>
    </div>
  );
};

export default RequisitionDetail;
