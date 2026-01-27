import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Header from "../Header";
import ManagerHeader from "./ManagerHeader";
import ManagerSidebar, { ManagerDashboardView } from "./ManagerSidebar";
import "../../styles/hr/hr-dashboard.css";
import RaiseRequisition from "./RaiseRequisition";
import MyRequisitions from "./MyRequisitions";
import RequisitionAudit from "./RequisitionAudit";

const viewLabels: Record<ManagerDashboardView, string> = {
  dashboard: "Dashboard",
  "raise-requisition": "Raise Requisition",
  "my-requisitions": "My Requisitions",
  "requisition-audit": "Requisition Audit",
};

const dashboardMetrics = [
  { label: "Open Requisitions", value: 5 },
  { label: "In Progress", value: 2 },
  { label: "Fulfilled", value: 9 },
  { label: "Avg. Days Open", value: 11 },
];

const ManagerDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] =
    useState<ManagerDashboardView>("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  const activeLabel = useMemo(() => viewLabels[activeView], [activeView]);

  const renderDashboard = () => (
    <div className="admin-metrics">
      {dashboardMetrics.map((metric) => (
        <div key={metric.label} className="stat-card">
          <span className="stat-number">{metric.value}</span>
          <span className="stat-label">{metric.label}</span>
        </div>
      ))}
    </div>
  );

  const renderContent = () => {
    switch (activeView) {
      case "dashboard":
        return renderDashboard();
      case "raise-requisition":
        return <RaiseRequisition />;
      case "my-requisitions":
        return <MyRequisitions />;
      case "requisition-audit":
        return <RequisitionAudit />;
      default:
        return (
          <>
            <h2 style={{ marginBottom: "12px" }}>{activeLabel}</h2>
            <p>Manager view under construction.</p>
          </>
        );
    }
  };

  return (
    <div className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}>
      <ManagerSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />

      <div
        className={`admin-main-content ${collapsed ? "sidebar-collapsed" : ""}`}
      >
        <Header />
        <ManagerHeader
          title={activeLabel}
          user={user}
          onLogout={() => {
            logout();
            navigate("/login", { replace: true });
          }}
        />
        <section className="admin-content-area">{renderContent()}</section>
      </div>
    </div>
  );
};

export default ManagerDashboard;
