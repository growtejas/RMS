import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Header from "../Header";
import HrHeader from "./HRHeader";
import HrSidebar, { HrDashboardView } from "./HRSidebar";
import "../../styles/admin/Dashboard.css";

const viewLabels: Record<HrDashboardView, string> = {
  dashboard: "Dashboard",
  employees: "Employees",
  "create-employee": "Create Employee",
  "employee-profile": "Employee Profile",
  onboarding: "Onboarding",
  "bench-availability": "Bench & Availability",
  skills: "Skills",
  reports: "Reports",
  "audit-logs": "Audit Logs",
};

const HrDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<HrDashboardView>("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  const activeLabel = useMemo(() => viewLabels[activeView], [activeView]);

  return (
    <div className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}>
      <HrSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />
      <div
        className={`admin-main-content ${collapsed ? "sidebar-collapsed" : ""}`}
      >
        <Header />
        <HrHeader
          title={activeLabel}
          user={user}
          onLogout={() => {
            logout();
            navigate("/login", { replace: true });
          }}
        />
        <section className="admin-content-area">
          <h2 style={{ marginBottom: "12px" }}>{activeLabel}</h2>
          <p>HR dashboard view: {activeLabel}</p>
        </section>
      </div>
    </div>
  );
};

export default HrDashboard;
