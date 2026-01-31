import React, { useEffect, useMemo, useState } from "react";
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
import { apiClient } from "../../api/client";

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

interface EmployeeListEntry {
  emp_id: string;
  full_name: string;
}

interface EmployeeDetail {
  emp_id: string;
  full_name: string;
  rbm_email: string;
  emp_status: string;
  doj?: string | null;
}

interface AssignmentEntry {
  assignment_id: number;
  department_id: number;
  start_date: string;
  end_date?: string | null;
}

interface DepartmentEntry {
  department_id: number;
  department_name: string;
}

const EmployeeProfile: React.FC = () => {
  /* ================= STATE ================= */
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchEmployees = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [employeesResponse, departmentsResponse] = await Promise.all([
          apiClient.get<EmployeeListEntry[]>("/employees/employees"),
          apiClient.get<DepartmentEntry[]>("/departments/"),
        ]);

        const departmentsById = new Map(
          (departmentsResponse.data ?? []).map((dept) => [
            dept.department_id,
            dept.department_name,
          ]),
        );

        const list = employeesResponse.data ?? [];

        const rows = await Promise.all(
          list.map(async (emp) => {
            const [detailResponse, assignmentsResponse] = await Promise.all([
              apiClient.get<EmployeeDetail>(`/employees/${emp.emp_id}`),
              apiClient.get<AssignmentEntry[]>(
                `/employees/${emp.emp_id}/assignments`,
              ),
            ]);

            const detail = detailResponse.data;
            const assignments = assignmentsResponse.data ?? [];
            const latestAssignment = assignments[0];
            const departmentName = latestAssignment?.department_id
              ? (departmentsById.get(latestAssignment.department_id) ?? "—")
              : "—";

            return {
              empId: detail.emp_id,
              fullName: detail.full_name,
              email: detail.rbm_email,
              status: detail.emp_status ?? "—",
              department: departmentName,
              doj: detail.doj ?? "—",
            } as Employee;
          }),
        );

        if (isMounted) {
          setEmployees(rows);
        }
      } catch (err) {
        if (!isMounted) return;
        const message =
          err instanceof Error ? err.message : "Failed to load employees";
        setError(message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchEmployees();

    return () => {
      isMounted = false;
    };
  }, []);

  /* ================= FILTER ================= */
  const filteredEmployees = useMemo(() => {
    return employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(search.toLowerCase()) ||
        e.empId.toLowerCase().includes(search.toLowerCase()) ||
        e.email.toLowerCase().includes(search.toLowerCase()),
    );
  }, [employees, search]);

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
          {isLoading && <div className="empty-state">Loading employees…</div>}

          {!isLoading && error && (
            <div className="empty-state" style={{ color: "var(--error)" }}>
              {error}
            </div>
          )}

          {!isLoading &&
            !error &&
            filteredEmployees.map((emp) => (
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

          {!isLoading && !error && filteredEmployees.length === 0 && (
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
                <span className="stat-number">—</span>
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
