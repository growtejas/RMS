import React, { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";
import Header from "../Header";
import HrHeader from "./HRHeader";
import HrSidebar from "./HRSidebar";
import "../../styles/hr/hr-dashboard.css";
import HRDashboardView from "./HRDashboardView";

const HrDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const activeLabel = useMemo(() => {
    if (location.pathname.startsWith("/hr/create-employee")) {
      return "Create Employee";
    }
    if (location.pathname.startsWith("/hr/employee-profile")) {
      return "Employee Profile";
    }
    if (location.pathname.startsWith("/hr/requisitions/")) {
      return "Requisition Details";
    }
    if (location.pathname.startsWith("/hr/requisitions")) {
      return "Requisitions";
    }
    if (location.pathname.startsWith("/hr/skills")) {
      return "Skills";
    }
    return "Dashboard";
  }, [location.pathname]);

  return (
    <div className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}>
      <HrSidebar
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
          {location.pathname === "/hr" ? (
            <HRDashboardView
              onViewRequisition={(reqId: number) => {
                navigate(`/hr/requisitions/${reqId}`);
              }}
            />
          ) : (
            <Outlet />
          )}
        </section>
      </div>
    </div>
  );
};

export default HrDashboard;
