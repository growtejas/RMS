"use client";

import React from "react";
import { CheckCircle } from "lucide-react";

import { formatRelativeTime } from "@/components/ta/requisition-detail/utils";

export type TimelineRowVM = {
  id: string;
  title: string;
  actor: string;
  time?: string | null;
  note?: string | null;
  isDelayed: boolean;
  isCompleted: boolean;
  isCurrent: boolean;
  isUpcoming: boolean;
};

export type TimelineTabProps = {
  timelineWithStatus: TimelineRowVM[];
  isEditing: boolean;
};

export function TimelineTab({
  timelineWithStatus,
  isEditing,
}: TimelineTabProps) {
  return (
    <div className="master-data-manager">
      <div className="data-manager-header">
        <h2>Activity Timeline</h2>
        <p className="subtitle">
          Complete history of requisition updates and assignments
        </p>
      </div>

      {timelineWithStatus.length === 0 ? (
        <div className="tickets-empty-state">No timeline activity yet.</div>
      ) : (
        <div className="milestone-timeline">
          {timelineWithStatus.map((item, idx) => {
            const statusClass = item.isCompleted
              ? item.isDelayed
                ? "milestone-node error"
                : "milestone-node completed"
              : item.isCurrent
                ? "milestone-node current"
                : "milestone-node upcoming";
            const timeLabel = item.time
              ? formatRelativeTime(item.time)
              : item.isUpcoming
                ? "Upcoming"
                : "Pending";
            return (
              <div key={item.id} className="milestone-row">
                <div className="milestone-track">
                  <div className={`milestone-node ${statusClass}`}>
                    {item.isCompleted ? <CheckCircle size={14} /> : idx + 1}
                  </div>
                  {idx < timelineWithStatus.length - 1 && (
                    <div
                      className={`milestone-line ${statusClass} ${item.isCurrent ? "active" : ""}`}
                    />
                  )}
                </div>
                <div className="milestone-card">
                  <div className="milestone-title">{item.title}</div>
                  <div className="milestone-meta">
                    <div className="milestone-avatar">
                      {item.actor
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase())
                        .join("")}
                    </div>
                    <div>
                      <div className="milestone-actor">{item.actor}</div>
                      <div className="milestone-time">{timeLabel}</div>
                    </div>
                  </div>
                  {item.note && (
                    <div className="milestone-note">Note: {item.note}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isEditing && (
        <div
          style={{
            marginTop: "32px",
            paddingTop: "24px",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "12px",
            }}
          >
            Add Timeline Entry
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <input
              type="text"
              placeholder="Event description..."
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            />
            <button className="action-button primary">Add Entry</button>
          </div>
        </div>
      )}
    </div>
  );
}
