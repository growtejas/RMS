import React from "react";

interface Requisition {
  id: string;
  project: string;
  role: string;
  level: string;
  status: "Open" | "In Progress" | "Fulfilled" | "Closed";
  priority: "High" | "Medium" | "Low";
}

const requisitions: Requisition[] = [
  {
    id: "REQ-2001",
    project: "Client Modernization",
    role: "Frontend Developer",
    level: "Senior",
    status: "Open",
    priority: "High",
  },
  {
    id: "REQ-2007",
    project: "Core Banking Upgrade",
    role: "Java Engineer",
    level: "Mid",
    status: "In Progress",
    priority: "Medium",
  },
  {
    id: "REQ-2010",
    project: "Analytics Pipeline",
    role: "Data Engineer",
    level: "Junior",
    status: "Open",
    priority: "Low",
  },
];

interface RequisitionsProps {
  onViewRequisition?: (reqId: string) => void;
}

const Requisitions: React.FC<RequisitionsProps> = ({ onViewRequisition }) => {
  return (
    <>
      <div className="manager-header">
        <h2>Requisitions</h2>
        <p className="subtitle">All active requisitions</p>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Requisition ID</th>
              <th>Project</th>
              <th>Role</th>
              <th>Level</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requisitions.map((req) => (
              <tr key={req.id}>
                <td>
                  <strong>{req.id}</strong>
                </td>
                <td>{req.project}</td>
                <td>{req.role}</td>
                <td>{req.level}</td>
                <td>{req.status}</td>
                <td>{req.priority}</td>
                <td>
                  <button
                    className="action-button"
                    type="button"
                    onClick={() => onViewRequisition?.(req.id)}
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
            {requisitions.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">No requisitions available.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default Requisitions;
