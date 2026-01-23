import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminHeader from "../../components/admin/AdminHeader";
import AdminMetrics from "../../components/admin/AdminMetrics";
import MasterDataManager from "../../components/admin/MasterDataManager";
import RolePermissionManager from "../../components/admin/RolePermissionManager";
import AuditLogViewer from "../../components/admin/AuditLogViewer";
import SystemHealth from "../../components/admin/SystemHealth";
import UserManager from "./UserManager";
import "../../styles/admin/Dashboard.css";
import { DashboardView } from "../../types/dashboard";

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const hasAdminAccess = user?.roles?.some((role) =>
    ["admin", "owner"].includes(role),
  );

  if (!hasAdminAccess) {
    return (
      <div className="unauthorized-access">
        <h2>Unauthorized Access</h2>
        <p>You don't have permission to access the admin dashboard.</p>
      </div>
    );
  }

  const renderActiveView = () => {
    switch (activeView) {
      case "overview":
        return (
          <>
            <AdminMetrics />
            <SystemHealth />
          </>
        );
      case "master-data":
        return <MasterDataManager />;
      case "role-management":
        return <RolePermissionManager />;
      case "audit-logs":
        return <AuditLogViewer />;
      case "system-health":
        return <SystemHealth expanded />;
      case "users":
        return <UserManager />;
    }
  };

  return (
    <div className="admin-dashboard">
      <AdminSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      <div
        className={`admin-main-content ${
          sidebarCollapsed ? "sidebar-collapsed" : ""
        }`}
      >
        <AdminHeader
          title={getViewTitle(activeView)}
          user={user}
          onLogout={() => {}}
        />

        <div className="admin-content-area">{renderActiveView()}</div>
      </div>
    </div>
  );
};

const getViewTitle = (view: DashboardView): string => {
  const titles: Record<DashboardView, string> = {
    overview: "System Overview",
    "master-data": "Master Data Management",
    "role-management": "Role & Permission Management",
    "audit-logs": "Audit Log Review",
    "system-health": "System Health Monitor",
    users: "User Management",
  };

  return titles[view];
};

export default AdminDashboard;
