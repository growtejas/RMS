import React from "react";

/* ======================================================
   Types
   ====================================================== */

interface MyRequisition {
  id: string;
  project: string;
  role: string;
  status: "Open" | "In Progress" | "Fulfilled" | "Closed";
  priority: "High" | "Medium" | "Low";
  slaDaysRemaining: number;
}

/* ======================================================
   Mock Data (Replace with API later)
   ====================================================== */

const myRequisitions: MyRequisition[] = [
  {
    id: "REQ-1998",
    project: "Talent Portal",
    role: "UI Engineer",
    status: "Open",
    priority: "High",
    slaDaysRemaining: 2,
  },
  {
    id: "REQ-2003",
    project: "API Gateway",
    role: "Backend Engineer",
    status: "In Progress",
    priority: "Medium",
    slaDaysRemaining: 9,
  },
];

/* ======================================================
   Props
   ====================================================== */

interface MyRequisitionsProps {
  onViewRequisition?: (reqId: string) => void;
}

/* ======================================================
   Helpers
   ====================================================== */

const getStatusClass = (status: MyRequisition["status"]) => {
  switch (status) {
    case "Open":
      return "open";
    case "In Progress":
      return "in-progress";
    case "Fulfilled":
      return "fulfilled";
    case "Closed":
      return "closed";
    default:
      return "";
  }
};

const getPriorityClass = (priority: MyRequisition["priority"]) => {
  switch (priority) {
    case "High":
      return "priority-high";
    case "Medium":
      return "priority-medium";
    case "Low":
      return "priority-low";
    default:
      return "";
  }
};

const getSlaClass = (days: number) => {
  if (days <= 3) return "critical";
  if (days <= 7) return "warning";
  return "";
};

/* ======================================================
   Component
   ====================================================== */

const MyRequisitions: React.FC<MyRequisitionsProps> = ({
  onViewRequisition,
}) => {
  return (
    <>
      {/* Header */}
      <div className="manager-header">
        <h2>My Requisitions</h2>
        <p className="subtitle">Requisitions assigned to you</p>
      </div>

      {/* Table */}
      <div className="ticket-table-container">
        <table className="ticket-table">
          <thead>
            <tr>
              <th>Req ID</th>
              <th>Project</th>
              <th>Role</th>
              <th>Status</th>
              <th>Priority</th>
              <th>SLA</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {myRequisitions.map((req) => (
              <tr key={req.id}>
                <td>
                  <strong>{req.id}</strong>
                </td>

                <td>{req.project}</td>

                <td>{req.role}</td>

                <td>
                  <span
                    className={`ticket-status ${getStatusClass(req.status)}`}
                  >
                    {req.status}
                  </span>
                </td>

                <td>
                  <span
                    className={`priority-indicator ${getPriorityClass(
                      req.priority,
                    )}`}
                  >
                    {req.priority}
                  </span>
                </td>

                <td>
                  <span
                    className={`sla-timer ${getSlaClass(req.slaDaysRemaining)}`}
                  >
                    {req.slaDaysRemaining} days left
                  </span>
                </td>

                <td>
                  <button
                    className="action-button primary"
                    onClick={() => onViewRequisition?.(req.id)}
                  >
                    Continue Work
                  </button>
                </td>
              </tr>
            ))}

            {myRequisitions.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="tickets-empty-state">
                    No requisitions assigned to you
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default MyRequisitions;
