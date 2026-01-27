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

/* ======================================================
   View Labels
   ====================================================== */

const viewLabels: Record<TADashboardView, string> = {
  dashboard: "Dashboard",
  requisitions: "Requisitions",
  "my-requisitions": "My Requisitions",
  "requisition-detail": "Requisition Detail",
  "resource-pool": "Resource Pool",
  reports: "Reports",
  "audit-logs": "Audit Logs",
};

/* ======================================================
   Dashboard Types
   ====================================================== */

type TADashboardMetric = {
  key: string;
  label: string;
  value: number;
  variant: "neutral" | "warning" | "success" | "critical";
};

type TAAlert = {
  id: string;
  message: string;
  severity: "warning" | "critical";
};

/* ======================================================
   Mock Dashboard Data (Replace with API later)
   ====================================================== */

const taDashboardMetrics: TADashboardMetric[] = [
  {
    key: "open",
    label: "Open Requisitions",
    value: 14,
    variant: "neutral",
  },
  {
    key: "inProgress",
    label: "In Progress",
    value: 6,
    variant: "warning",
  },
  {
    key: "assignedToMe",
    label: "Assigned to Me",
    value: 4,
    variant: "success",
  },
  {
    key: "avgTime",
    label: "Avg Fulfillment Time (Days)",
    value: 12,
    variant: "neutral",
  },
];

const taAlerts: TAAlert[] = [
  {
    id: "REQ-1023",
    message: "Requisition REQ-1023 aging over 30 days",
    severity: "critical",
  },
  {
    id: "REQ-1041",
    message: "REQ-1041 nearing SLA breach (2 days left)",
    severity: "warning",
  },
];

/* ======================================================
   Component
   ====================================================== */

const TADashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeView, setActiveView] = useState<TADashboardView>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [selectedRequisitionId, setSelectedRequisitionId] = useState<
    string | null
  >(null);

  const activeLabel = useMemo(() => viewLabels[activeView], [activeView]);

  /* ======================================================
     Dashboard Render
     ====================================================== */

  const renderDashboard = () => (
    <>
      {/* KPI GRID */}
      <div className="tickets-kpi-grid">
        {taDashboardMetrics.map((metric) => (
          <div key={metric.key} className={`ticket-kpi-card ${metric.variant}`}>
            <div className="kpi-number">{metric.value}</div>
            <div className="kpi-label">{metric.label}</div>
          </div>
        ))}
      </div>

      {/* ALERTS & SLA RISKS */}
      <div className="stat-card" style={{ marginTop: 24 }}>
        <div className="manager-header">
          <h2>Alerts & SLA Risks</h2>
          <p className="subtitle">Requisitions requiring immediate attention</p>
        </div>

        {taAlerts.length === 0 ? (
          <div className="empty-state">
            <p>No alerts at the moment</p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {taAlerts.map((alert) => (
              <li
                key={alert.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 0",
                  borderBottom: "1px solid var(--border-light)",
                }}
              >
                <span>{alert.message}</span>

                {alert.severity === "critical" ? (
                  <span className="aging-indicator aging-30-plus">
                    Critical
                  </span>
                ) : (
                  <span className="sla-timer warning">SLA Warning</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  /* ======================================================
     Navigation Handlers
     ====================================================== */

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
        return null;
    }
  };

  /* ======================================================
     Layout
     ====================================================== */

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
