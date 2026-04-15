import React, { useMemo } from "react";
import { EmployeeCore } from "./types";

type OverviewTabProps = {
  employee: EmployeeCore;
  departmentName?: string | null;
  contactsComplete: boolean;
  hasSkills: boolean;
  hasEducation: boolean;
  hasFinance: boolean;
};

const OverviewTab: React.FC<OverviewTabProps> = ({
  employee,
  departmentName,
  contactsComplete,
  hasSkills,
  hasEducation,
  hasFinance,
}) => {
  const completionPct = useMemo(() => {
    const checks = [
      employee.full_name,
      employee.rbm_email,
      employee.doj,
      contactsComplete,
      hasSkills,
      hasEducation,
      hasFinance,
    ];
    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }, [
    employee.full_name,
    employee.rbm_email,
    employee.doj,
    contactsComplete,
    hasSkills,
    hasEducation,
    hasFinance,
  ]);

  return (
    <div className="form-section active">
      <div className="section-header">
        <h2>
          <span className="section-icon">0</span> Overview
        </h2>
        <p className="section-subtitle">
          High-level snapshot of employee profile and status.
        </p>
      </div>
      <div className="section-content">
        <div className="admin-metrics">
          <div className="stat-card">
            <span className="stat-number">{employee.emp_status}</span>
            <span className="stat-label">Current Status</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{completionPct}%</span>
            <span className="stat-label">Profile Complete</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{departmentName ?? "—"}</span>
            <span className="stat-label">Department</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{employee.doj ?? "—"}</span>
            <span className="stat-label">Date of Joining</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(OverviewTab);
