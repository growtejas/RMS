import React from "react";

interface Requisition {
  id: string;
  project: string;
  skill: string;
  level: string;
  requiredCount: number;
  status: "Open" | "In Progress" | "Fulfilled" | "Closed";
  assignedTA?: string;
  daysOpen: number;
  priority: "High" | "Medium" | "Low";
  indicators: {
    benchAvailable?: boolean;
    noInternalMatch?: boolean;
    pendingOnboarding?: boolean;
  };
}

/* ================= MOCK DATA ================= */

const requisitions: Requisition[] = [
  {
    id: "REQ-1012",
    project: "Client Alpha Revamp",
    skill: "React",
    level: "Senior",
    requiredCount: 2,
    status: "Open",
    assignedTA: "",
    daysOpen: 42,
    priority: "High",
    indicators: {
      benchAvailable: true,
    },
  },
  {
    id: "REQ-1034",
    project: "Banking API Migration",
    skill: "Java",
    level: "Mid",
    requiredCount: 3,
    status: "In Progress",
    assignedTA: "TA-Lead-01",
    daysOpen: 18,
    priority: "Medium",
    indicators: {
      noInternalMatch: true,
    },
  },
  {
    id: "REQ-1071",
    project: "Analytics Platform",
    skill: "Python",
    level: "Junior",
    requiredCount: 1,
    status: "Open",
    assignedTA: "",
    daysOpen: 9,
    priority: "Low",
    indicators: {
      pendingOnboarding: true,
    },
  },
];

/* ================= COMPONENT ================= */

interface HrRequisitionsProps {
  onViewRequisition?: (requisitionId: string) => void;
}

const HrRequisitions: React.FC<HrRequisitionsProps> = ({
  onViewRequisition,
}) => {
  return (
    <>
      {/* ================= HEADER =================
      <div className="manager-header">
        <h2>Requisitions</h2>
        <p className="subtitle">Project Resource Requests</p>
      </div> */}

      {/* ================= KPIs ================= */}
      <div className="admin-metrics">
        <div className="stat-card">
          <span className="stat-number">6</span>
          <span className="stat-label">Open Tickets</span>
        </div>

        <div className="stat-card">
          <span className="stat-number">4</span>
          <span className="stat-label">In Progress</span>
        </div>

        <div className="stat-card">
          <span className="stat-number">12</span>
          <span className="stat-label">Fulfilled</span>
        </div>

        <div className="stat-card">
          <span className="stat-number">42</span>
          <span className="stat-label">Oldest Open (Days)</span>
        </div>
      </div>

      {/* ================= FILTERS ================= */}
      <div className="log-filters">
        <div className="filter-grid">
          <div className="filter-item">
            <label>Status</label>
            <select>
              <option>All</option>
              <option>Open</option>
              <option>In Progress</option>
              <option>Fulfilled</option>
              <option>Closed</option>
            </select>
          </div>

          <div className="filter-item">
            <label>Skill</label>
            <select>
              <option>All</option>
              <option>React</option>
              <option>Java</option>
              <option>Python</option>
            </select>
          </div>

          <div className="filter-item">
            <label>Project</label>
            <input type="text" placeholder="Project name" />
          </div>

          <div className="filter-item">
            <label>Priority</label>
            <select>
              <option>All</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>

          <div className="filter-item">
            <label>Aging</label>
            <select>
              <option>All</option>
              <option>0–7 days</option>
              <option>8–30 days</option>
              <option>30+ days</option>
            </select>
          </div>
        </div>

        <div className="filter-group">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by Ticket ID or Project name"
            />
          </div>
        </div>
      </div>

      {/* ================= TABLE ================= */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ticket ID</th>
              <th>Project</th>
              <th>Required Skill</th>
              <th>Count</th>
              <th>Status</th>
              <th>Assigned TA</th>
              <th>Days Open</th>
              <th>Priority</th>
              <th>Indicators</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {requisitions.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.id}</strong>
                </td>

                <td>{t.project}</td>

                <td>
                  {t.skill} ({t.level})
                </td>

                <td>{t.requiredCount}</td>

                <td>
                  <span
                    className={`status-badge ${
                      t.status === "Open"
                        ? "inactive"
                        : t.status === "Fulfilled"
                          ? "active"
                          : ""
                    }`}
                  >
                    {t.status}
                  </span>
                </td>

                <td>{t.assignedTA || "—"}</td>

                <td>{t.daysOpen}</td>

                <td>{t.priority}</td>

                <td>
                  {t.indicators.benchAvailable && (
                    <span title="Bench available">✔</span>
                  )}
                  {t.indicators.noInternalMatch && (
                    <span title="No internal match">⚠</span>
                  )}
                  {t.indicators.pendingOnboarding && (
                    <span title="Skills pending onboarding">⏳</span>
                  )}
                </td>
                <td>
                  <button
                    className="action-button"
                    type="button"
                    onClick={() => onViewRequisition?.(t.id)}
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}

            {requisitions.length === 0 && (
              <tr>
                <td colSpan={10}>
                  <div className="empty-state">
                    No tickets match the selected filters.
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

export default HrRequisitions;
