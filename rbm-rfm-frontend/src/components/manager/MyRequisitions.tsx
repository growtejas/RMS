import React from "react";

interface MyRequisition {
  id: string;
  project: string;
  role: string;
  status: "Open" | "In Progress" | "Fulfilled" | "Closed";
}

const myRequisitions: MyRequisition[] = [
  { id: "REQ-3001", project: "Web Revamp", role: "UI Lead", status: "Open" },
  {
    id: "REQ-3005",
    project: "Data Warehouse",
    role: "ETL Engineer",
    status: "In Progress",
  },
];

const MyRequisitions: React.FC = () => {
  return (
    <>
      <div className="manager-header">
        <h2>My Requisitions</h2>
        <p className="subtitle">Requisitions raised by you</p>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Requisition ID</th>
              <th>Project</th>
              <th>Role</th>
              <th>Status</th>
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
              </tr>
            ))}
            {myRequisitions.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">No requisitions found.</div>
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
