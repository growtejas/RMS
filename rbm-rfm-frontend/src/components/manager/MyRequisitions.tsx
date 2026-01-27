import React from "react";
import { Eye } from "lucide-react";

interface RequisitionItem {
  skill: string;
  status: "Pending" | "Fulfilled" | "Cancelled";
  employee?: string;
}

interface MyRequisition {
  id: string;
  project: string;
  status: "Open" | "In Progress" | "Fulfilled" | "Closed";
  assignedTA: string;
  lastUpdated: string;
  items: RequisitionItem[];
}

const myRequisitions: MyRequisition[] = [
  {
    id: "REQ-3001",
    project: "Web Revamp",
    status: "Open",
    assignedTA: "—",
    lastUpdated: "2024-01-18",
    items: [
      { skill: "React", status: "Pending" },
      { skill: "UI/UX", status: "Pending" },
    ],
  },
  {
    id: "REQ-3005",
    project: "Data Warehouse",
    status: "In Progress",
    assignedTA: "Anita HR",
    lastUpdated: "2024-01-21",
    items: [
      { skill: "ETL Engineer", status: "Fulfilled", employee: "RBM-023" },
      { skill: "Data Analyst", status: "Pending" },
    ],
  },
];

const MyRequisitions: React.FC = () => {
  return (
    <>
      {/* Page Header */}
      <div className="manager-header">
        <h2>My Requisitions</h2>
        <p className="subtitle">
          Track progress of the demands you have raised.
        </p>
      </div>

      {/* Requisitions Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Req ID</th>
              <th>Project</th>
              <th>Status</th>
              <th>Pending Items</th>
              <th>Assigned TA</th>
              <th>Last Updated</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {myRequisitions.map((req) => {
              const pendingCount = req.items.filter(
                (i) => i.status === "Pending",
              ).length;

              return (
                <tr key={req.id}>
                  <td>
                    <strong>{req.id}</strong>
                  </td>
                  <td>{req.project}</td>
                  <td>
                    <span
                      className={`status-badge ${req.status
                        .toLowerCase()
                        .replace(" ", "-")}`}
                    >
                      {req.status}
                    </span>
                  </td>
                  <td>
                    {pendingCount > 0 ? (
                      <span className="text-amber-600 font-medium">
                        {pendingCount} open
                      </span>
                    ) : (
                      <span className="text-green-600">0</span>
                    )}
                  </td>
                  <td>
                    {req.assignedTA === "—" ? (
                      <span className="text-slate-400">Unassigned</span>
                    ) : (
                      req.assignedTA
                    )}
                  </td>
                  <td>{req.lastUpdated}</td>
                  <td>
                    <button className="action-button text-sm">
                      <Eye size={14} />
                      View
                    </button>
                  </td>
                </tr>
              );
            })}

            {myRequisitions.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">No requisitions found.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Authority Notice */}
      <div className="mt-4 text-xs text-slate-500">
        • This view is read-only. • Item status, assignments, and closure are
        handled by HR / TA.
      </div>
    </>
  );
};

export default MyRequisitions;
