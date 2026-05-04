"use client";

import React from "react";
import { AlertCircle, CheckCircle, Mail } from "lucide-react";

import type { RequisitionPipelineBindings } from "./pipelineTabBindings";

export function ShortlistedTabPanel({ bindings }: { bindings: RequisitionPipelineBindings }) {
  return (
  <div style={{ marginTop: "8px" }}>
    {bindings.transitionError ? (
      <div
        style={{
          marginBottom: "14px",
          padding: "12px 16px",
          borderRadius: "10px",
          backgroundColor: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          color: "var(--error)",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <AlertCircle size={16} />
        {bindings.transitionError}
        <button
          type="button"
          onClick={() => bindings.setTransitionError(null)}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: "var(--error)",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>
    ) : null}
    {bindings.shortlistEmailOk ? (
      <div
        style={{
          marginBottom: "14px",
          padding: "10px 14px",
          borderRadius: "10px",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          border: "1px solid rgba(16, 185, 129, 0.25)",
          color: "var(--text-primary)",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <CheckCircle
          size={16}
          style={{ color: "rgb(5, 150, 105)", flexShrink: 0 }}
        />
        {bindings.shortlistEmailOk}
        <button
          type="button"
          onClick={() => bindings.setShortlistEmailOk(null)}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
            lineHeight: 1,
            opacity: 0.6,
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    ) : null}
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "12px",
        alignItems: "center",
        marginBottom: "14px",
      }}
    >
      <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
        Position:
      </label>
      <select
        value={bindings.candidateItemFilter === "all" ? "all" : bindings.candidateItemFilter}
        onChange={(e) =>
          bindings.setCandidateItemFilter(
            e.target.value === "all" ? "all" : Number(e.target.value),
          )
        }
        style={{
          padding: "6px 12px",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle)",
          fontSize: "12px",
          backgroundColor: "var(--bg-primary)",
        }}
      >
        <option value="all">All positions</option>
        {bindings.ticket.items.map((item) => (
          <option key={item.numericItemId} value={item.numericItemId}>
            {item.skill} — {item.level}
          </option>
        ))}
      </select>
      {bindings.shortlistedCandidatesForTable.some((c) => c.application_id) ? (
        <button
          type="button"
          className="action-button"
          style={{ fontSize: "11px", padding: "6px 12px" }}
          onClick={() => {
            const ids = bindings.shortlistedCandidatesForTable
              .map((c) => c.application_id)
              .filter((id): id is number => id != null);
            const allSelected =
              ids.length > 0 &&
              ids.every((id) => bindings.shortlistBulkAppIds.includes(id));
            if (allSelected) {
              bindings.setShortlistBulkAppIds([]);
            } else {
              bindings.setShortlistBulkAppIds(ids);
            }
          }}
        >
          Toggle all
        </button>
      ) : null}
      <button
        type="button"
        className="action-button primary"
        style={{ fontSize: "11px", padding: "6px 12px" }}
        disabled={
          bindings.shortlistBulkWorking || bindings.shortlistBulkAppIds.length === 0
        }
        onClick={() => void bindings.handleBulkShortlistToInterviewing()}
      >
        {bindings.shortlistBulkWorking
          ? "Updating…"
          : `Move ${bindings.shortlistBulkAppIds.length} to Interviewing`}
      </button>
    </div>
    {bindings.candidatesLoading ? (
      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
        Loading…
      </div>
    ) : bindings.shortlistedCandidatesForTable.length === 0 ? (
      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
        No shortlisted candidates for this filter.
      </div>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "12px",
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
              <th
                style={{
                  padding: "8px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                Select
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                Name
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                Email
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                Position
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                Experience
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {[...bindings.shortlistedCandidatesForTable]
              .sort((a, b) =>
                a.full_name.localeCompare(b.full_name, undefined, {
                  sensitivity: "base",
                }),
              )
              .map((c) => {
                const linkedItem = bindings.ticket.items.find(
                  (it) => it.numericItemId === c.requisition_item_id,
                );
                const appId = c.application_id;
                return (
                  <tr
                    key={`${c.application_id ?? c.candidate_id}-${c.requisition_item_id}`}
                    style={{ backgroundColor: "var(--bg-primary)" }}
                  >
                    <td
                      style={{
                        padding: "8px",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      {appId != null ? (
                        <input
                          type="checkbox"
                          checked={bindings.shortlistBulkAppIds.includes(appId)}
                          onChange={() => {
                            bindings.setShortlistBulkAppIds((prev) =>
                              prev.includes(appId)
                                ? prev.filter((id) => id !== appId)
                                : [...prev, appId],
                            );
                          }}
                          aria-label={`Select ${c.full_name}`}
                        />
                      ) : null}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid var(--border-subtle)",
                        fontWeight: 600,
                      }}
                    >
                      {c.full_name}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {c.email}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      {linkedItem
                        ? `${linkedItem.skill} — ${linkedItem.level}`
                        : `Item #${c.requisition_item_id}`}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      {c.total_experience_years != null
                        ? `${c.total_experience_years} yrs`
                        : "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "6px",
                          alignItems: "center",
                        }}
                      >
                        <button
                          type="button"
                          className="action-button"
                          style={{ fontSize: "11px", padding: "4px 10px" }}
                          onClick={() => bindings.openCandidateModal(c, "execute")}
                        >
                          Open
                        </button>
                        {appId != null ? (
                          <button
                            type="button"
                            className="action-button"
                            style={{
                              fontSize: "11px",
                              padding: "4px 10px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            disabled={bindings.sendShortlistEmailAppId === appId}
                            onClick={() => void bindings.handleSendShortlistEmail(appId)}
                            title="Send the shortlist notification email to this candidate"
                          >
                            <Mail size={12} />
                            {bindings.sendShortlistEmailAppId === appId
                              ? "Sending…"
                              : "Send email"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    )}
  </div>
  );
}
