import React, { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";
import AdminSidebar from "../../components/admin/AdminSidebar";
import Header from "../../components/Header";
import AdminHeader from "../../components/admin/AdminHeader";
import "../../styles/admin/Dashboard.css";

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const hasAdminAccess = user?.roles?.some((role) =>
    ["admin", "owner"].includes(role),
  );

  const title = useMemo(() => {
    if (location.pathname.startsWith("/admin/master-data")) {
      return "Master Data Management";
    }
    if (location.pathname.startsWith("/admin/audit-logs")) {
      return "Audit Log Review";
    }
    if (location.pathname.startsWith("/admin/users")) {
      return "User Management";
    }
    return "System Overview";
  }, [location.pathname]);

  if (!hasAdminAccess) {
    return (
      <div className="unauthorized-access">
        <h2>Unauthorized Access</h2>
        <p>You don't have permission to access the admin dashboard.</p>
      </div>
    );
  }

  return (
    <div
      className={`admin-dashboard ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
    >
      <AdminSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      <div
        className={`admin-main-content ${
          sidebarCollapsed ? "sidebar-collapsed" : ""
        }`}
      >
        <Header />

        <AdminHeader
          title={title}
          user={user}
          onLogout={() => {}}
          showUser={false}
        />

        <div className="admin-content-area admin-content-area--gradient-panels">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
