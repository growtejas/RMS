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
import { AlertTriangle, Clock, TrendingUp } from "lucide-react";

const viewLabels: Record<ManagerDashboardView, string> = {
  dashboard: "Dashboard",
  "raise-requisition": "Raise Requisition",
  "my-requisitions": "My Requisitions",
  "requisition-audit": "Requisition Audit",
};

/* ===== Dashboard KPI Data (Mock – API later) ===== */
const dashboardMetrics = [
  { label: "Total Requisitions", value: 12 },
  { label: "Open", value: 4 },
  { label: "In Progress", value: 5 },
  { label: "Closed", value: 3 },
  { label: "Pending Positions", value: 9 },
  { label: "Avg Fulfillment (Days)", value: 18 },
];

const agingAlerts = [
  {
    id: 1,
    title: "SLA Risk",
    message: "REQ-2024-004 open for 35 days",
    severity: "high",
  },
  {
    id: 2,
    title: "Pending Positions",
    message: "3 positions pending in REQ-2024-002",
    severity: "medium",
  },
];

const ManagerDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] =
    useState<ManagerDashboardView>("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  const activeLabel = useMemo(() => viewLabels[activeView], [activeView]);

  /* ===== DASHBOARD VIEW ===== */
  const renderDashboard = () => (
    <>
      {/* KPI Cards */}
      <div className="admin-metrics">
        {dashboardMetrics.map((metric) => (
          <div key={metric.label} className="stat-card">
            <span className="stat-number">{metric.value}</span>
            <span className="stat-label">{metric.label}</span>
          </div>
        ))}
      </div>

      {/* Alerts */}
      <div className="audit-log-viewer mt-6">
        <div className="viewer-header">
          <h2>Alerts & Attention</h2>
          <p className="subtitle">Requisitions requiring review</p>
        </div>

        {agingAlerts.length === 0 ? (
          <div className="empty-logs">No alerts at this time.</div>
        ) : (
          <div className="space-y-3">
            {agingAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {alert.severity === "high" ? (
                    <AlertTriangle className="text-red-600" size={18} />
                  ) : (
                    <Clock className="text-amber-600" size={18} />
                  )}
                  <div>
                    <div className="font-medium">{alert.title}</div>
                    <div className="text-sm text-slate-600">
                      {alert.message}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-slate-500">Monitor</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Insight Footer */}
      <div className="mt-6 p-4 bg-slate-50 border rounded-lg">
        <div className="flex items-center gap-3">
          <TrendingUp size={18} />
          <div>
            <div className="font-medium">Insight</div>
            <div className="text-sm text-slate-600">
              Most requisitions are progressing normally, but aged requisitions
              may impact delivery timelines.
            </div>
          </div>
        </div>
      </div>
    </>
  );

  /* ===== MAIN CONTENT SWITCH ===== */
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
        return null;
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
