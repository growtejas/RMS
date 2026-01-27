import React, { useState } from "react";

/* ======================================================
   Types
   ====================================================== */

interface RequisitionItem {
  id: string;
  skill: string;
  level: string;
  quantity: number;
  status: "Pending" | "Fulfilled";
  assignedEmployee?: string;
}

interface ActivityLog {
  id: string;
  message: string;
  timestamp: string;
}

interface RequisitionDetailProps {
  requisitionId?: string | null;
  onBack?: () => void;
}

/* ======================================================
   Mock Data (Replace with API later)
   ====================================================== */

const requisitionSummary = {
  id: "REQ-2001",
  project: "Client Modernization",
  status: "In Progress",
  priority: "High",
  budget: "₹18,00,000",
  requiredBy: "15-Feb-2026",
};

const requisitionItemsData: RequisitionItem[] = [
  {
    id: "ITEM-1",
    skill: "React",
    level: "Senior",
    quantity: 1,
    status: "Pending",
  },
  {
    id: "ITEM-2",
    skill: "TypeScript",
    level: "Mid",
    quantity: 1,
    status: "Fulfilled",
    assignedEmployee: "RBM-021 | Neha Kulkarni",
  },
];

const activityLogData: ActivityLog[] = [
  {
    id: "LOG-1",
    message: "Requisition created",
    timestamp: "12-Jan-2026 10:15",
  },
  {
    id: "LOG-2",
    message: "Assigned to TA Rahul Mehta",
    timestamp: "13-Jan-2026 09:40",
  },
  {
    id: "LOG-3",
    message: "TypeScript resource allocated",
    timestamp: "18-Jan-2026 16:05",
  },
];

/* ======================================================
   Component
   ====================================================== */

const RequisitionDetail: React.FC<RequisitionDetailProps> = ({
  requisitionId,
  onBack,
}) => {
  const [notes, setNotes] = useState("");

  return (
    <>
      {/* Header */}
      <div className="manager-header">
        <h2>Requisition Detail</h2>
        <p className="subtitle">
          Fulfillment workspace for requisition{" "}
          {requisitionId ?? requisitionSummary.id}
        </p>
      </div>

      {/* Back Button */}
      <div style={{ marginBottom: 20 }}>
        <button className="action-button" onClick={onBack}>
          ← Back to Requisitions
        </button>
      </div>

      {/* =============================
          REQUISITION SUMMARY
         ============================= */}
      <div className="stat-card" style={{ marginBottom: 28 }}>
        <div className="data-manager-header">
          <h3>Requisition Summary</h3>
        </div>

        <div className="data-manager-content">
          <table className="data-table">
            <tbody>
              <tr>
                <td>
                  <strong>Requisition ID</strong>
                </td>
                <td>{requisitionSummary.id}</td>
              </tr>
              <tr>
                <td>
                  <strong>Project</strong>
                </td>
                <td>{requisitionSummary.project}</td>
              </tr>
              <tr>
                <td>
                  <strong>Status</strong>
                </td>
                <td>
                  <span className="ticket-status in-progress">
                    {requisitionSummary.status}
                  </span>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Priority</strong>
                </td>
                <td>
                  <span className="priority-indicator priority-high">
                    {requisitionSummary.priority}
                  </span>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Budget</strong>
                </td>
                <td>{requisitionSummary.budget}</td>
              </tr>
              <tr>
                <td>
                  <strong>Required By</strong>
                </td>
                <td>{requisitionSummary.requiredBy}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* =============================
          LINE ITEM FULFILLMENT
         ============================= */}
      <div className="stat-card" style={{ marginBottom: 28 }}>
        <div className="data-manager-header">
          <h3>Required Skills & Fulfillment</h3>
        </div>

        <div className="ticket-table-container">
          <table className="ticket-table">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Level</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Assigned Employee</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {requisitionItemsData.map((item) => (
                <tr key={item.id}>
                  <td>{item.skill}</td>
                  <td>{item.level}</td>
                  <td>{item.quantity}</td>
                  <td>
                    <span
                      className={`ticket-status ${
                        item.status === "Fulfilled" ? "fulfilled" : "open"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td>
                    {item.assignedEmployee ?? (
                      <span className="status-badge inactive">
                        Not Assigned
                      </span>
                    )}
                  </td>
                  <td>
                    {item.status === "Pending" ? (
                      <button className="action-button primary">
                        Allocate Internal Resource
                      </button>
                    ) : (
                      <span className="status-badge active">Completed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* =============================
          NOTES
         ============================= */}
      <div className="stat-card" style={{ marginBottom: 28 }}>
        <div className="data-manager-header">
          <h3>TA Notes</h3>
          <p className="subtitle">
            Internal notes (visible to TA & Leads only)
          </p>
        </div>

        <textarea
          className="form-field"
          placeholder="Add notes about sourcing, discussions, blockers..."
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* =============================
          ACTIVITY TIMELINE
         ============================= */}
      <div className="stat-card">
        <div className="data-manager-header">
          <h3>Activity Timeline</h3>
        </div>

        <ul style={{ listStyle: "none", padding: 0 }}>
          {activityLogData.map((log) => (
            <li
              key={log.id}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <strong>{log.timestamp}</strong>
              <div>{log.message}</div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
};

export default RequisitionDetail;
