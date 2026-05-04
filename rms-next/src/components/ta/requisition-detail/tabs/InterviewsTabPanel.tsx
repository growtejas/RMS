"use client";

import React from "react";
import { InterviewStatusBadge } from "@/components/interviews/InterviewStatusBadge";
import { interviewUi } from "@/components/interviews/interview-ui-theme";
import { Table, TBody, THead, TD, TH, TR } from "@/components/ui/Table";

import type { RequisitionPipelineBindings } from "./pipelineTabBindings";

export function InterviewsTabPanel({ bindings }: { bindings: RequisitionPipelineBindings }) {
  return (
  <div style={{ marginTop: "8px", fontFamily: interviewUi.fontSans }}>
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "12px",
        alignItems: "center",
        marginBottom: "16px",
        padding: "12px 14px",
        borderRadius: interviewUi.radiusMd,
        border: `1px solid ${interviewUi.border}`,
        backgroundColor: interviewUi.surface,
      }}
    >
      <label style={{ fontSize: "12px", color: interviewUi.textMuted }}>
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
          borderRadius: interviewUi.radiusSm,
          border: `1px solid ${interviewUi.border}`,
          fontSize: "12px",
          backgroundColor: interviewUi.bg,
          color: interviewUi.text,
        }}
      >
        <option value="all">All positions</option>
        {bindings.ticket.items.map((item) => (
          <option key={item.numericItemId} value={item.numericItemId}>
            {item.skill} — {item.level}
          </option>
        ))}
      </select>
    </div>

    <div
      style={{
        marginBottom: "24px",
        padding: "16px",
        borderRadius: interviewUi.radiusLg,
        border: `1px solid ${interviewUi.border}`,
        backgroundColor: interviewUi.surface,
        boxShadow: interviewUi.shadow,
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          marginBottom: "6px",
          color: interviewUi.text,
        }}
      >
        Candidates in Interviewing stage
      </div>
      <p
        style={{
          fontSize: "11px",
          color: interviewUi.textMuted,
          marginTop: 0,
          marginBottom: "12px",
          lineHeight: 1.45,
        }}
      >
        Pipeline stage <strong style={{ color: interviewUi.text }}>Interviewing</strong>{" "}
        is separate from calendar rounds. Use{" "}
        <strong style={{ color: interviewUi.text }}>Schedule interview</strong> to add a
        round (or <strong style={{ color: interviewUi.text }}>Profile</strong> for the
        full hiring view).
      </p>
      {bindings.candidatesLoading ? (
        <div style={{ fontSize: "12px", color: interviewUi.textSubtle }}>
          Loading…
        </div>
      ) : bindings.interviewingCandidatesForTable.length === 0 ? (
        <div style={{ fontSize: "12px", color: interviewUi.textSubtle }}>
                No candidates in Interviewing for this filter. Move someone from Shortlisted or
          open a profile to change stage.
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Position</TH>
              <TH>Stage</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {[...bindings.interviewingCandidatesForTable]
              .sort((a, b) =>
                a.full_name.localeCompare(b.full_name, undefined, {
                  sensitivity: "base",
                }),
              )
              .map((c) => {
                const linkedItem = bindings.ticket.items.find(
                  (it) => it.numericItemId === c.requisition_item_id,
                );
                return (
                  <TR
                    key={`int-pipeline-${c.application_id ?? c.candidate_id}-${c.requisition_item_id}`}
                    hover
                  >
                    <TD className="font-medium text-[--color-text]">
                      {c.full_name}
                    </TD>
                    <TD className="text-[--color-text-muted]">{c.email}</TD>
                    <TD className="text-[--color-text]">
                      {linkedItem
                        ? `${linkedItem.skill} — ${linkedItem.level}`
                        : `Item #${c.requisition_item_id}`}
                    </TD>
                    <TD className="text-[--color-text-muted]">
                      {c.current_stage}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-[--color-accent] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-95"
                          onClick={() => bindings.openCandidateModal(c, "execute")}
                        >
                          Schedule interview
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[--color-border] bg-white px-3 py-1.5 text-xs font-semibold text-[--color-text-muted] hover:bg-slate-50"
                          onClick={() => bindings.openCandidateModal(c, "execute")}
                        >
                          Profile
                        </button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
          </TBody>
        </Table>
      )}
    </div>

    <div
      style={{
        fontSize: "13px",
        fontWeight: 600,
        marginBottom: "10px",
        color: interviewUi.text,
      }}
    >
      Scheduled interview rounds
    </div>
    {bindings.reqInterviewsLoading ? (
      <div style={{ fontSize: "12px", color: interviewUi.textSubtle }}>
        Loading scheduled rounds…
      </div>
    ) : bindings.reqInterviews.length === 0 ? (
      <div
        style={{
          padding: "14px 16px",
          borderRadius: interviewUi.radiusMd,
          border: `1px solid ${interviewUi.border}`,
          borderLeft: `3px solid ${interviewUi.accent}`,
          backgroundColor: interviewUi.surfaceElevated,
          fontSize: "12px",
          color: interviewUi.textMuted,
          lineHeight: 1.5,
        }}
      >
        {bindings.interviewingCandidatesForTable.length > 0 ? (
          <>
            <strong style={{ color: interviewUi.text }}>
              No calendar rounds yet — that’s expected.
            </strong>{" "}
            The table above is the <em>Interviewing</em> pipeline list. This section only
            lists <strong style={{ color: interviewUi.text }}>scheduled</strong> rounds
            (date, interviewer, status). Click{" "}
            <strong style={{ color: interviewUi.text }}>Schedule interview</strong> on a
            candidate to create one; it will show up here automatically.
          </>
        ) : (
          <>
            No scheduled rounds for this requisition. When bindings.candidates reach{" "}
            <strong style={{ color: interviewUi.text }}>Interviewing</strong> and you add
            rounds from their profile, each round appears here as a separate row.
          </>
        )}
      </div>
    ) : (
      <div
        style={{
          overflowX: "auto",
          borderRadius: interviewUi.radiusLg,
          border: `1px solid ${interviewUi.border}`,
          backgroundColor: interviewUi.surface,
          boxShadow: interviewUi.shadow,
          overflow: "hidden",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "12px",
            color: interviewUi.text,
          }}
        >
          <thead>
            <tr
              style={{
                textAlign: "left",
                color: interviewUi.textSubtle,
                backgroundColor: interviewUi.surfaceElevated,
              }}
            >
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: `1px solid ${interviewUi.border}`,
                }}
              >
                Candidate
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: `1px solid ${interviewUi.border}`,
                }}
              >
                Round
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: `1px solid ${interviewUi.border}`,
                }}
              >
                Interviewer
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: `1px solid ${interviewUi.border}`,
                }}
              >
                Scheduled
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: `1px solid ${interviewUi.border}`,
                }}
              >
                Status
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: `1px solid ${interviewUi.border}`,
                }}
              >
                Result
              </th>
              <th
                style={{
                  padding: "8px 10px",
                  borderBottom: `1px solid ${interviewUi.border}`,
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {bindings.reqInterviews.map((iv, rowIdx) => {
              const cand = bindings.candidates.find(
                (x) => x.candidate_id === iv.candidate_id,
              );
              return (
                <tr
                  key={iv.id}
                  style={{
                    backgroundColor:
                      rowIdx % 2 === 0 ? interviewUi.surface : interviewUi.bg,
                  }}
                >
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${interviewUi.border}`,
                      fontWeight: 600,
                    }}
                  >
                    {iv.candidate_name ??
                      cand?.full_name ??
                      `Candidate #${iv.candidate_id}`}
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 400,
                        color: interviewUi.textSubtle,
                      }}
                    >
                      {iv.candidate_email ?? cand?.email ?? ""}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${interviewUi.border}`,
                    }}
                  >
                    {iv.round_name?.trim() || iv.round_number}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${interviewUi.border}`,
                    }}
                  >
                    {iv.panelists && iv.panelists.length > 0
                      ? iv.panelists.map((p) => p.display_name).join(", ")
                      : iv.interviewer_name ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${interviewUi.border}`,
                    }}
                  >
                    {new Date(iv.scheduled_at).toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${interviewUi.border}`,
                    }}
                  >
                    <InterviewStatusBadge status={iv.status} />
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${interviewUi.border}`,
                      color: interviewUi.textMuted,
                    }}
                  >
                    {iv.result ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${interviewUi.border}`,
                    }}
                  >
                    {cand ? (
                      <button
                        type="button"
                        style={{
                          fontSize: "11px",
                          padding: "6px 12px",
                          borderRadius: interviewUi.radiusSm,
                          cursor: "pointer",
                          backgroundColor: "transparent",
                          color: interviewUi.textMuted,
                          border: `1px solid ${interviewUi.border}`,
                        }}
                        onClick={() => bindings.openCandidateModal(cand, "execute")}
                      >
                        Open
                      </button>
                    ) : (
                      <span style={{ fontSize: "11px", color: interviewUi.textSubtle }}>
                        —
                      </span>
                    )}
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
