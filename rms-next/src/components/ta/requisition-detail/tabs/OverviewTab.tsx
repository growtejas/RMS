"use client";

import React from "react";
import { Briefcase, Calendar, MessageSquare, Users } from "lucide-react";

import type { RequisitionDetailTabId, TicketData } from "../types";

export type OverviewCompletionStats = {
  progress: number;
  openPositions: number;
  totalItems: number;
};

export type OverviewTabProps = {
  ticket: TicketData;
  completionStats: OverviewCompletionStats;
  resolveUserName: (userId?: number | null) => string;
  setActiveTab: (tab: RequisitionDetailTabId) => void;
  setIsEditing: (v: boolean) => void;
};

export function OverviewTab({
  ticket,
  completionStats,
  resolveUserName,
  setActiveTab,
  setIsEditing,
}: OverviewTabProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: "24px",
      }}
    >
      {/* Left Column - Basic Info */}
      <div>
        <div className="master-data-manager">
          <div className="data-manager-header">
            <h2>Project & Client Details</h2>
            <p className="subtitle">
              Complete project information and requirements
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "24px",
              marginBottom: "24px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "12px",
                }}
              >
                Project Information
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Project Name:
                  </span>
                  <span style={{ fontWeight: 500 }}>
                    {ticket.projectName}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  {/* <span style={{ color: "var(--text-secondary)" }}>
                    Project Code:
                  </span>
                  <span style={{ fontFamily: "monospace" }}>
                    {ticket.projectCode}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                > */}
                  <span style={{ color: "var(--text-secondary)" }}>
                    Client:
                  </span>
                  <span style={{ fontWeight: 500 }}>{ticket.client}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Project Manager:
                  </span>
                  <span>{resolveUserName(ticket.raisedById)}</span>
                </div>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "12px",
                }}
              >
                Logistics
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Work Mode:
                  </span>
                  <span style={{ fontWeight: 500 }}>{ticket.workMode}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Location:
                  </span>
                  <span>{ticket.location}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Project Duration:
                  </span>
                  <span>{ticket.projectDuration}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Budget:
                  </span>
                  <span style={{ fontWeight: 500 }}>{ticket.budget}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "8px",
              }}
            >
              Business Justification
            </div>
            <div
              style={{
                padding: "16px",
                backgroundColor: "var(--bg-secondary)",
                borderRadius: "12px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <p
                style={{
                  color: "var(--text-primary)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-line",
                }}
              >
                {ticket.justification}
              </p>
            </div>
          </div>

          {/* Assignment Info */}
          <div
            style={{
              padding: "20px",
              backgroundColor: "var(--bg-tertiary)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "12px",
              }}
            >
              Assignment Details
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "4px",
                  }}
                >
                  <Users size={14} />
                  <span style={{ color: "var(--text-secondary)" }}>
                    Assigned TA:
                  </span>
                </div>
                <span style={{ fontWeight: 500 }}>
                  {ticket.assignedTAId
                    ? resolveUserName(ticket.assignedTAId)
                    : "Unassigned"}
                </span>
              </div>
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "4px",
                  }}
                >
                  <Calendar size={14} />
                  <span style={{ color: "var(--text-secondary)" }}>
                    Date Created:
                  </span>
                </div>
                <span style={{ fontWeight: 500 }}>
                  {ticket.dateCreated
                    ? new Date(ticket.dateCreated).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Quick Stats & Actions */}
      <div
        style={{ display: "flex", flexDirection: "column", gap: "24px" }}
      >
        {/* Quick Stats - aligned with HR */}
        <div className="audit-log-viewer">
          <div className="viewer-header">
            <h2>Quick Stats</h2>
            <p className="subtitle">Requisition metrics at a glance</p>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              marginTop: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>
                Days Open
              </span>
              <span style={{ fontWeight: 600 }}>
                {ticket.daysOpen} day{ticket.daysOpen !== 1 ? "s" : ""}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>
                Completion
              </span>
              <span style={{ color: "var(--success)", fontWeight: 600 }}>
                {completionStats.progress}%
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>
                Open Positions
              </span>
              <span style={{ fontWeight: 600 }}>
                {completionStats.openPositions} of{" "}
                {completionStats.totalItems}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>
                SLA Status
              </span>
              <span
                className={`sla-timer ${
                  (() => {
                    const remainingHours =
                      ticket.slaHours - ticket.daysOpen * 24;
                    if (remainingHours <= 0) return "critical";
                    if (remainingHours <= 48) return "warning";
                    return "";
                  })()
                }`}
              >
                {(() => {
                  const remainingHours =
                    ticket.slaHours - ticket.daysOpen * 24;
                  if (remainingHours <= 0) return "Breached";
                  return `${remainingHours}h remaining`;
                })()}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions - wired like HR */}
        <div className="audit-log-viewer">
          <div className="viewer-header">
            <h2>Quick Actions</h2>
            <p className="subtitle">TA operations</p>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              marginTop: "16px",
            }}
          >
            <button
              type="button"
              className="action-button"
              style={{ justifyContent: "flex-start", textAlign: "left" }}
              onClick={() => setActiveTab("ats")}
            >
              <Users size={16} />
              View Candidates
            </button>
            <button
              type="button"
              className="action-button"
              style={{ justifyContent: "flex-start", textAlign: "left" }}
              onClick={() => setActiveTab("items")}
            >
              <Briefcase size={16} />
              Manage Requisition Items
            </button>
            <button
              type="button"
              className="action-button"
              style={{ justifyContent: "flex-start", textAlign: "left" }}
              onClick={() => {
                setActiveTab("timeline");
                setIsEditing(true);
              }}
            >
              <MessageSquare size={16} />
              Add Internal Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
