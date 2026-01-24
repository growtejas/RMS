import React from "react";
import { Users, Database, AlertTriangle, CheckCircle } from "lucide-react";

const AdminMetrics: React.FC = () => {
  const metrics = [
    {
      key: "users",
      label: "Total Users",
      value: "1,234",
      icon: <Users size={20} />,
    },
    {
      key: "resources",
      label: "Resources Tracked",
      value: "456",
      icon: <Database size={20} />,
    },
    {
      key: "alerts",
      label: "System Alerts",
      value: "12",
      icon: <AlertTriangle size={20} />,
    },
    {
      key: "uptime",
      label: "Uptime",
      value: "99.9%",
      icon: <CheckCircle size={20} />,
    },
  ];

  return (
    <div className="admin-metrics">
      {metrics.map((metric) => (
        <div className="stat-card" key={metric.key}>
          <div className={`stat-icon-wrapper ${metric.key}`}>{metric.icon}</div>
          <span className="stat-number">{metric.value}</span>
          <span className="stat-label">{metric.label}</span>
        </div>
      ))}
    </div>
  );
};

export default AdminMetrics;
