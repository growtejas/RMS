import React from "react";

interface MyRequisition {
  id: string;
  project: string;
  role: string;
  status: "Open" | "In Progress" | "Fulfilled" | "Closed";
}

const myRequisitions: MyRequisition[] = [
  {
    id: "REQ-1998",
    project: "Talent Portal",
    role: "UI Engineer",
    status: "Open",
  },
  {
    id: "REQ-2003",
    project: "API Gateway",
    role: "Backend Engineer",
    status: "In Progress",
  },
];

interface MyRequisitionsProps {
  onViewRequisition?: (reqId: string) => void;
}

const MyRequisitions: React.FC<MyRequisitionsProps> = ({
  onViewRequisition,
}) => {
  return (
    <>
      <div className="manager-header">
        <h2>My Requisitions</h2>
        <p className="subtitle">Requisitions owned by you</p>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Requisition ID</th>
              <th>Project</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
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
                <td>{req.status}</td>
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
            {myRequisitions.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">No requisitions assigned.</div>
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
