import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Header from "../Header";
import OwnerHeader from "./OwnerHeader";
import OwnerSidebar, { OwnerDashboardView } from "./OwnerSidebar";
import "../../styles/hr/hr-dashboard.css";
import ExecutiveDashboard from "./ExecutiveDashboard";
import ResourceUtilization from "./ResourceUtilization";
import RequisitionOverview from "./RequisitionOverview";
import TAHrPerformance from "./TAHrPerformance";
import AuditApprovals from "./AuditApprovals";

const viewLabels: Record<OwnerDashboardView, string> = {
  "executive-dashboard": "Executive Dashboard",
  "resource-utilization": "Resource Utilization",
  "requisition-overview": "Requisition Overview",
  "ta-hr-performance": "TA & HR Performance",
  "audit-approvals": "Audit & Approvals",
};

const OwnerDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<OwnerDashboardView>(
    "executive-dashboard",
  );
  const [collapsed, setCollapsed] = useState(false);

  const activeLabel = useMemo(() => viewLabels[activeView], [activeView]);

  const renderContent = () => {
    switch (activeView) {
      case "executive-dashboard":
        return <ExecutiveDashboard />;
      case "resource-utilization":
        return <ResourceUtilization />;
      case "requisition-overview":
        return <RequisitionOverview />;
      case "ta-hr-performance":
        return <TAHrPerformance />;
      case "audit-approvals":
        return <AuditApprovals />;
      default:
        return (
          <>
            <h2 style={{ marginBottom: "12px" }}>{activeLabel}</h2>
            <p>Owner view under construction.</p>
          </>
        );
    }
  };

  return (
    <div className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}>
      <OwnerSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />

      <div
        className={`admin-main-content ${collapsed ? "sidebar-collapsed" : ""}`}
      >
        <Header />
        <OwnerHeader
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

export default OwnerDashboard;
