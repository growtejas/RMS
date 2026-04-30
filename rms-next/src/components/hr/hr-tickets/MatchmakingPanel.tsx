"use client";

import React, { useState } from "react";
import { Briefcase, Users, UserPlus, AlertCircle } from "lucide-react";

/**
 * Map an item status to a ticket-status CSS class.
 * Uses canonical item status values only.
 */
const getItemStatusClass = (status: string): string => {
  switch (status) {
    case "Pending":
      return "ticket-status open";
    case "Sourcing":
    case "Shortlisted":
    case "Interviewing":
    case "Offered":
      return "ticket-status in-progress";
    case "Fulfilled":
      return "ticket-status fulfilled";
    case "Cancelled":
      return "ticket-status closed";
    default:
      return "";
  }
};

export interface HrTicketsRequisitionLike {
  id: string;
  project: string;
  client: string;
  raisedBy: string;
  items: HrTicketsRequisitionItemLike[];
}
export interface HrTicketsRequisitionItemLike {
  id: string;
  skill: string;
  level: string;
  experience?: number;
  education: string;
  itemStatus: string;
  assignedEmployeeName?: string;
}
export interface HrTicketsEmployeeMatchLike {
  id: string;
  name: string;
  skill: string;
  level: string;
  experience?: number;
  location: string;
  availability: string;
  department: string;
  matchScore?: number;
}

export interface MatchmakingPanelProps {
  requisition: HrTicketsRequisitionLike;
  employees: HrTicketsEmployeeMatchLike[];
  onAssignEmployee: (itemId: string, empId: string) => void;
  requesterDisplayName?: string;
}

const MatchmakingPanel: React.FC<MatchmakingPanelProps> = ({
  requisition,
  employees,
  onAssignEmployee,
  requesterDisplayName,
}) => {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "24px",
        height: "100%",
      }}
    >
      {/* Left Panel - Demand */}
      <div
        style={{
          backgroundColor: "var(--bg-primary)",
          borderRadius: "16px",
          padding: "24px",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <h3
            style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}
          >
            <Briefcase
              size={16}
              style={{ marginRight: "8px", verticalAlign: "middle" }}
            />
            Demand Details
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Requisition ID
              </div>
              <div style={{ fontWeight: 600 }}>{requisition.id}</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Project
              </div>
              <div style={{ fontWeight: 600 }}>{requisition.project}</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Client
              </div>
              <div>{requisition.client}</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Raised By
              </div>
              <div>{requesterDisplayName ?? requisition.raisedBy}</div>
            </div>
          </div>
        </div>

        <h4
          style={{
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "16px",
            color: "var(--text-primary)",
          }}
        >
          Requisition Items ({requisition.items.length} positions)
        </h4>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {requisition.items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: "16px",
                borderRadius: "12px",
                border:
                  selectedItem === item.id
                    ? "2px solid var(--primary-accent)"
                    : "1px solid var(--border-subtle)",
                backgroundColor:
                  selectedItem === item.id
                    ? "rgba(59, 130, 246, 0.05)"
                    : "var(--bg-secondary)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onClick={() => setSelectedItem(item.id)}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <div>
                  <span className={getItemStatusClass(item.itemStatus)}>
                    {item.itemStatus}
                  </span>
                  <strong style={{ marginLeft: "8px", fontSize: "14px" }}>
                    {item.skill} ({item.level})
                  </strong>
                </div>
                {item.assignedEmployeeName && (
                  <div style={{ fontSize: "12px", color: "var(--success)" }}>
                    ✓ Assigned: {item.assignedEmployeeName}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
              >
                <div>Exp: {item.experience ?? "—"} years</div>
                <div>Education: {item.education}</div>
                <div>Status: {item.itemStatus}</div>
              </div>

              {item.itemStatus === "Pending" && selectedItem === item.id && (
                <div style={{ marginTop: "12px" }}>
                  <button
                    className="action-button primary"
                    style={{ fontSize: "12px", padding: "8px 16px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // In real app, this would open a modal with employee selection
                      const matchedEmployee = employees.find(
                        (emp) =>
                          emp.skill.includes(item.skill.split(" ")[0] ?? "") &&
                          emp.level === item.level,
                      );
                      if (matchedEmployee) {
                        onAssignEmployee?.(item.id, matchedEmployee.id);
                      }
                    }}
                  >
                    <UserPlus size={12} />
                    Map Resource
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Employee Suggestions */}
      <div
        style={{
          backgroundColor: "var(--bg-primary)",
          borderRadius: "16px",
          padding: "24px",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 600 }}>
            <Users
              size={16}
              style={{ marginRight: "8px", verticalAlign: "middle" }}
            />
            Suggested Employees
          </h3>
          <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
            {employees.length} matches found
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {employees.map((employee) => (
            <div
              key={employee.id}
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid var(--border-subtle)",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <strong style={{ fontSize: "14px" }}>{employee.name}</strong>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginTop: "2px",
                    }}
                  >
                    {employee.skill} • {employee.level} • {employee.department}
                  </div>
                </div>
                <div
                  style={{
                    padding: "4px 8px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: 600,
                    background:
                      employee.availability === "Available"
                        ? "rgba(16, 185, 129, 0.1)"
                        : employee.availability === "Unknown"
                          ? "rgba(148, 163, 184, 0.2)"
                          : "rgba(245, 158, 11, 0.1)",
                    color:
                      employee.availability === "Available"
                        ? "var(--success)"
                        : employee.availability === "Unknown"
                          ? "var(--text-tertiary)"
                          : "var(--warning)",
                  }}
                >
                  {employee.availability}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                  marginBottom: "12px",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
              >
                <div>📍 {employee.location}</div>
                <div>📊 {employee.experience ?? "—"} years exp</div>
                <div style={{ textAlign: "right" }}>
                  <strong style={{ color: "var(--primary-accent)" }}>
                    {employee.matchScore ?? "—"}% match
                  </strong>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{ fontSize: "11px", color: "var(--text-tertiary)" }}
                >
                  ID: {employee.id}
                </div>
                <button
                  className="action-button primary"
                  style={{ fontSize: "11px", padding: "6px 12px" }}
                  onClick={() => {
                    if (selectedItem) {
                      onAssignEmployee(selectedItem, employee.id);
                    }
                  }}
                  disabled={!selectedItem}
                >
                  Assign to Selected Position
                </button>
              </div>
            </div>
          ))}
        </div>

        {selectedItem && (
          <div
            style={{
              marginTop: "24px",
              padding: "16px",
              backgroundColor: "rgba(59, 130, 246, 0.05)",
              borderRadius: "12px",
              border: "1px solid rgba(59, 130, 246, 0.1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <AlertCircle size={14} color="var(--primary-accent)" />
              <strong style={{ fontSize: "12px" }}>Assignment Logic</strong>
            </div>
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
              }}
            >
              When you assign an employee to a requisition item, the{" "}
              <code>assigned_emp_id</code> field in the{" "}
              <code>requisition_items</code> table will be updated, and the item
              status will change to &quot;Fulfilled&quot;. The requisition will
              remain
              open until all items are fulfilled or cancelled.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchmakingPanel;
