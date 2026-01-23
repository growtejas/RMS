import React from "react";
import { Users, Database, AlertTriangle, CheckCircle } from "lucide-react";

const AdminMetrics: React.FC = () => {
    return (
        <div className="admin-metrics">
            <div className="stat-card">
                <div className="stat-icon-wrapper" style={{ background: "#e0e7ff", color: "#4f46e5", padding: "10px", borderRadius: "50%", width: "fit-content", marginBottom: "10px" }}>
                    <Users size={24} />
                </div>
                <span className="stat-number">1,234</span>
                <span className="stat-label">Total Users</span>
            </div>

            <div className="stat-card">
                <div className="stat-icon-wrapper" style={{ background: "#dbeafe", color: "#2563eb", padding: "10px", borderRadius: "50%", width: "fit-content", marginBottom: "10px" }}>
                    <Database size={24} />
                </div>
                <span className="stat-number">456</span>
                <span className="stat-label">Resources tracked</span>
            </div>

            <div className="stat-card">
                <div className="stat-icon-wrapper" style={{ background: "#fee2e2", color: "#dc2626", padding: "10px", borderRadius: "50%", width: "fit-content", marginBottom: "10px" }}>
                    <AlertTriangle size={24} />
                </div>
                <span className="stat-number">12</span>
                <span className="stat-label">System Alerts</span>
            </div>

            <div className="stat-card">
                <div className="stat-icon-wrapper" style={{ background: "#d1fae5", color: "#059669", padding: "10px", borderRadius: "50%", width: "fit-content", marginBottom: "10px" }}>
                    <CheckCircle size={24} />
                </div>
                <span className="stat-number">99.9%</span>
                <span className="stat-label">Uptime</span>
            </div>
        </div>
    );
};

export default AdminMetrics;
