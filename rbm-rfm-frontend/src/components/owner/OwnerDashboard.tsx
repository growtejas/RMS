import React, { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";
import Header from "../Header";
import OwnerHeader from "./OwnerHeader";
import OwnerSidebar from "./OwnerSidebar";
import "../../styles/hr/hr-dashboard.css";
import ExecutiveDashboard from "./ExecutiveDashboard";
import ResourceUtilization from "./ResourceUtilization";
import RequisitionOverview from "./RequisitionOverview";
import TAHrPerformance from "./TAHrPerformance";
import AuditApprovals from "./AuditApprovals";

const viewLabels: Record<string, string> = {
  "executive-dashboard": "Executive Dashboard",
  "resource-utilization": "Resource Utilization",
  "requisition-overview": "Requisition Overview",
  "ta-hr-performance": "TA & HR Performance",
  "audit-approvals": "Audit & Approvals",
};

const OwnerDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeView] = useState<string>("executive-dashboard");
  const [collapsed, setCollapsed] = useState(false);

  const activeLabel = useMemo(() => {
    if (location.pathname.startsWith("/owner/resource-utilization")) {
      return viewLabels["resource-utilization"];
    }
    if (location.pathname.startsWith("/owner/requisition-overview")) {
      return viewLabels["requisition-overview"];
    }
    if (location.pathname.startsWith("/owner/ta-hr-performance")) {
      return viewLabels["ta-hr-performance"];
    }
    if (location.pathname.startsWith("/owner/audit-approvals")) {
      return viewLabels["audit-approvals"];
    }
    return viewLabels["executive-dashboard"];
  }, [location.pathname]);

  return (
    <div className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}>
      <OwnerSidebar
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
        <section className="admin-content-area">
          {location.pathname === "/owner" ? (
            <ExecutiveDashboard />
          ) : location.pathname === "/owner/resource-utilization" ? (
            <ResourceUtilization />
          ) : location.pathname === "/owner/requisition-overview" ? (
            <RequisitionOverview />
          ) : location.pathname === "/owner/ta-hr-performance" ? (
            <TAHrPerformance />
          ) : location.pathname === "/owner/audit-approvals" ? (
            <AuditApprovals />
          ) : (
            <Outlet />
          )}
        </section>
      </div>
    </div>
  );
};

export default OwnerDashboard;
