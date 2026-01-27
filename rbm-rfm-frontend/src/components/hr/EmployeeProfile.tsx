// components/hr/EmployeeProfile.tsx
import React, { useState } from "react";
import {
  User,
  Phone,
  Award,
  GraduationCap,
  CreditCard,
  FileText,
  Edit,
  Plus,
} from "lucide-react";

type ProfileTab =
  | "overview"
  | "core"
  | "contact"
  | "skills"
  | "education"
  | "financial"
  | "audit";

const EmployeeProfile: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  const employee = {
    empId: "RBM-001",
    fullName: "John Doe",
    email: "john.doe@rbm.com",
    doj: "2023-01-15",
    status: "Onboarding",
    department: "Engineering",
  };

  const tabs: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <User size={16} /> },
    { id: "core", label: "Core Details", icon: <User size={16} /> },
    { id: "contact", label: "Contact Details", icon: <Phone size={16} /> },
    { id: "skills", label: "Skills", icon: <Award size={16} /> },
    { id: "education", label: "Education", icon: <GraduationCap size={16} /> },
    { id: "financial", label: "Financial", icon: <CreditCard size={16} /> },
    { id: "audit", label: "Audit Log", icon: <FileText size={16} /> },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      /* ================= OVERVIEW ================= */
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

      /* ================= CORE ================= */
      case "core":
        return (
          <div className="master-data-manager">
            <div className="manager-header">
              <h3>Core Details</h3>
              <p className="subtitle">Primary employee identity information.</p>
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

            <div className="form-field">
              <label>Status</label>
              <input value={employee.status} disabled />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="action-button primary">
                <Edit size={14} />
                Edit Core Details
              </button>
            </div>
          </div>
        );

      /* ================= CONTACT ================= */
      case "contact":
        return (
          <div className="master-data-manager">
            <div className="manager-header">
              <h3>Contact Details</h3>
              <p className="subtitle">
                Work, personal, and emergency contact information.
              </p>
            </div>

            <div className="empty-state">No contact details added yet.</div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="action-button primary">
                <Plus size={14} />
                Add / Edit Contact Details
              </button>
            </div>
          </div>
        );

      /* ================= SKILLS ================= */
      case "skills":
        return (
          <div className="master-data-manager">
            <div className="manager-header">
              <h3>Skills</h3>
              <p className="subtitle">Employee skills and proficiency.</p>
            </div>

            <div className="empty-state">No skills added yet.</div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="action-button primary">
                <Plus size={14} />
                Add Skill
              </button>
            </div>
          </div>
        );

      /* ================= EDUCATION ================= */
      case "education":
        return (
          <div className="master-data-manager">
            <div className="manager-header">
              <h3>Education</h3>
              <p className="subtitle">Academic qualifications.</p>
            </div>

            <div className="empty-state">No education records available.</div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="action-button primary">
                <Plus size={14} />
                Add Education
              </button>
            </div>
          </div>
        );

      /* ================= FINANCIAL ================= */
      case "financial":
        return (
          <div className="master-data-manager">
            <div className="manager-header">
              <h3>Financial Details</h3>
              <p className="subtitle">
                Restricted information. Authorized users only.
              </p>
            </div>

            <div className="empty-state">
              You do not have permission to view financial details.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="action-button primary">
                <Edit size={14} />
                Edit Financial Details
              </button>
            </div>
          </div>
        );

      /* ================= AUDIT ================= */
      case "audit":
        return (
          <div className="audit-log-viewer">
            <div className="manager-header">
              <h3>Audit Log</h3>
              <p className="subtitle">
                Record of changes made to employee data.
              </p>
            </div>

            <div className="empty-logs">No audit records available.</div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Page Header */}
      <div className="manager-header">
        <h2>Employee Profile</h2>
        <p className="subtitle">
          Consolidated 360° view of employee information.
        </p>
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

      {/* Tab Content */}
      {renderTabContent()}
    </>
  );
};

export default EmployeeProfile;
