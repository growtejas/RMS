import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Header from "../Header";
import TAHeader from "./TAHeader";
import TASidebar, { TADashboardView } from "./TASidebar";
import "../../styles/hr/hr-dashboard.css";
import Requisitions from "./Requisitions";
import MyRequisitions from "./MyRequisitions";
import RequisitionDetail from "./RequisitionDetail";
import ResourcePool from "./ResourcePool";
import TAReports from "./TAReports";
import TAAuditLog from "./TAAuditLog";

const viewLabels: Record<TADashboardView, string> = {
  dashboard: "Dashboard",
  requisitions: "Requisitions",
  "my-requisitions": "My Requisitions",
  "requisition-detail": "Requisition Detail",
  "resource-pool": "Resource Pool",
  reports: "Reports",
  "audit-logs": "Audit Logs",
};

const dashboardMetrics = [
  { label: "Open Requisitions", value: 14 },
  { label: "In Progress", value: 6 },
  { label: "Fulfilled", value: 21 },
  { label: "Avg. Time to Fill (Days)", value: 12 },
];

const TADashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<TADashboardView>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [selectedRequisitionId, setSelectedRequisitionId] = useState<
    string | null
  >(null);

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

  const handleViewDetail = (reqId: string) => {
    setSelectedRequisitionId(reqId);
    setActiveView("requisition-detail");
  };

  const renderContent = () => {
    switch (activeView) {
      case "dashboard":
        return renderDashboard();
      case "requisitions":
        return <Requisitions onViewRequisition={handleViewDetail} />;
      case "my-requisitions":
        return <MyRequisitions onViewRequisition={handleViewDetail} />;
      case "requisition-detail":
        return (
          <RequisitionDetail
            requisitionId={selectedRequisitionId}
            onBack={() => setActiveView("requisitions")}
          />
        );
      case "resource-pool":
        return <ResourcePool />;
      case "reports":
        return <TAReports />;
      case "audit-logs":
        return <TAAuditLog />;
      default:
        return (
          <>
            <h2 style={{ marginBottom: "12px" }}>{activeLabel}</h2>
            <p>TA view under construction.</p>
          </>
        );
    }
  };

  return (
    <div className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}>
      <TASidebar
        activeView={activeView}
        onViewChange={setActiveView}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />

      <div
        className={`admin-main-content ${collapsed ? "sidebar-collapsed" : ""}`}
      >
        <Header />
        <TAHeader
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

export default TADashboard;
