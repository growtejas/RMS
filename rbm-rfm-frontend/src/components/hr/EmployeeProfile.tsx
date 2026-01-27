import React, { useMemo, useState } from "react";
import {
  User,
  Phone,
  Award,
  GraduationCap,
  CreditCard,
  FileText,
  Edit,
  Plus,
  Search,
  ArrowLeft,
} from "lucide-react";

type ProfileTab =
  | "overview"
  | "core"
  | "contact"
  | "skills"
  | "education"
  | "financial"
  | "audit";

interface Employee {
  empId: string;
  fullName: string;
  email: string;
  status: string;
  department: string;
  doj: string;
}

/* ================= MOCK EMPLOYEES ================= */
const EMPLOYEES: Employee[] = [
  {
    empId: "RBM-001",
    fullName: "John Doe",
    email: "john.doe@rbm.com",
    status: "Onboarding",
    department: "Engineering",
    doj: "2023-01-15",
  },
  {
    empId: "RBM-002",
    fullName: "Priya Sharma",
    email: "priya.sharma@rbm.com",
    status: "Active",
    department: "Marketing",
    doj: "2022-11-03",
  },
  {
    empId: "RBM-003",
    fullName: "Amit Patel",
    email: "amit.patel@rbm.com",
    status: "Bench",
    department: "Engineering",
    doj: "2021-06-21",
  },
];

const EmployeeProfile: React.FC = () => {
  /* ================= STATE ================= */
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  /* ================= FILTER ================= */
  const filteredEmployees = useMemo(() => {
    return EMPLOYEES.filter(
      (e) =>
        e.fullName.toLowerCase().includes(search.toLowerCase()) ||
        e.empId.toLowerCase().includes(search.toLowerCase()) ||
        e.email.toLowerCase().includes(search.toLowerCase()),
    );
  }, [search]);

  /* ================= TABS ================= */
  const tabs: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <User size={14} /> },
    { id: "core", label: "Core Details", icon: <User size={14} /> },
    { id: "contact", label: "Contact Details", icon: <Phone size={14} /> },
    { id: "skills", label: "Skills", icon: <Award size={14} /> },
    { id: "education", label: "Education", icon: <GraduationCap size={14} /> },
    { id: "financial", label: "Financial", icon: <CreditCard size={14} /> },
    { id: "audit", label: "Audit Log", icon: <FileText size={14} /> },
  ];

  /* ================= EMPLOYEE SELECTOR ================= */
  if (!selectedEmployee) {
    return (
      <>
        {/* <div className="manager-header">
          <h2>Employee Profiles</h2>
          <p className="subtitle">
            Search and select an employee to view their 360° profile.
          </p>
        </div> */}

        {/* Search */}
        <div className="log-filters">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search by name, employee ID, or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Employee Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "16px",
            marginTop: "24px",
          }}
        >
          {filteredEmployees.map((emp) => (
            <div
              key={emp.empId}
              className="stat-card"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setSelectedEmployee(emp);
                setActiveTab("overview");
              }}
            >
              <div style={{ fontWeight: 600 }}>{emp.fullName}</div>
              <div className="text-xs text-slate-500">{emp.empId}</div>

              <div style={{ marginTop: "12px", fontSize: "13px" }}>
                <div>
                  <strong>Status:</strong> {emp.status}
                </div>
                <div>
                  <strong>Dept:</strong> {emp.department}
                </div>
              </div>
            </div>
          ))}

          {filteredEmployees.length === 0 && (
            <div className="empty-state">No employees match your search.</div>
          )}
        </div>
      </>
    );
  }

  /* ================= PROFILE VIEW ================= */
  const employee = selectedEmployee;

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="master-data-manager">
            <div className="manager-header">
              <h3>Employee Overview</h3>
              <p className="subtitle">
                High-level snapshot of employee profile and status.
              </p>
            </div>

            <div className="admin-metrics">
              <div className="stat-card">
                <span className="stat-number">{employee.status}</span>
                <span className="stat-label">Current Status</span>
              </div>

              <div className="stat-card">
                <span className="stat-number">70%</span>
                <span className="stat-label">Profile Complete</span>
              </div>

              <div className="stat-card">
                <span className="stat-number">{employee.department}</span>
                <span className="stat-label">Department</span>
              </div>
            </div>
          </div>
        );

      case "core":
        return (
          <div className="master-data-manager">
            <div className="manager-header">
              <h3>Core Details</h3>
            </div>

            <div className="form-field">
              <label>Employee ID</label>
              <input value={employee.empId} disabled />
            </div>

            <div className="form-field">
              <label>Full Name</label>
              <input value={employee.fullName} disabled />
            </div>

            <div className="form-field">
              <label>Email</label>
              <input value={employee.email} disabled />
            </div>

            <div className="form-field">
              <label>Date of Joining</label>
              <input value={employee.doj} disabled />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="action-button primary">
                <Edit size={14} />
                Edit Core Details
              </button>
            </div>
          </div>
        );

      default:
        return <div className="empty-state">Section coming soon.</div>;
    }
  };

  return (
    <>
      {/* Back */}
      <button
        className="action-button"
        style={{ marginBottom: "16px" }}
        onClick={() => setSelectedEmployee(null)}
      >
        <ArrowLeft size={14} />
        Back to Employee List
      </button>

      {/* Header */}
      <div className="manager-header">
        <h2>{employee.fullName}</h2>
        <p className="subtitle">{employee.empId}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`control-button ${
              activeTab === tab.id ? "primary" : ""
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {renderTabContent()}
    </>
  );
};

export default EmployeeProfile;
