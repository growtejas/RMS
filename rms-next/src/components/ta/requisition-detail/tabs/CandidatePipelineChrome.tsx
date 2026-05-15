"use client";

import React from "react";
import { UserPlus } from "lucide-react";
import BulkResumeUploadPanel from "@/components/candidates/BulkResumeUploadPanel";
import {
  fetchRequisitionItemRanking,
  recomputeRequisitionItemRanking,
  runAiEvaluationForRequisitionItem,
} from "@/lib/api/candidateApi";

import type { RequisitionPipelineBindings } from "./pipelineTabBindings";

export type CandidatePipelineChromeProps = {
  bindings: RequisitionPipelineBindings;
  children: React.ReactNode;
};

export function CandidatePipelineChrome({ bindings, children }: CandidatePipelineChromeProps) {
  return (
    <div className="master-data-manager">
  <div
    className="data-manager-header"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}
  >
    <div>
      <h2>Candidate Pipeline</h2>
      <p className="subtitle">
        {bindings.activeTab === "ats"
          ? "Quality-bucket board for the selected line — shortlist or reject from the candidate panel."
          : bindings.activeTab === "shortlisted"
            ? "Shortlisted applications only. Open a row for interviews and stage moves."
            : "Interviewing-stage roster and scheduled rounds for this requisition."}
      </p>
    </div>
    {!bindings.readOnly &&
      bindings.ticket.items.some((it) => bindings.canEditItem(it)) && (
      <button
        className="action-button primary"
        style={{ display: "flex", alignItems: "center", gap: "6px" }}
        onClick={() => {
          const editableItem = bindings.ticket.items.find((it) =>
            bindings.canEditItem(it),
          );
          bindings.setAddCandidateItemId(
            editableItem?.numericItemId ??
              bindings.ticket.items[0]?.numericItemId ??
              null,
          );
          bindings.setShowAddCandidate(true);
        }}
        disabled={!bindings.ticket.items.length}
      >
        <UserPlus size={14} /> Add Candidate
      </button>
    )}
  </div>

  {/* Add Candidate Form */}
  {!bindings.readOnly && bindings.showAddCandidate && (
    <form
      onSubmit={bindings.handleAddCandidate}
      style={{
        marginBottom: "20px",
        padding: "20px",
        borderRadius: "12px",
        backgroundColor: "rgba(59,130,246,0.04)",
        border: "1px solid rgba(59,130,246,0.15)",
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: 600,
          marginBottom: "16px",
        }}
      >
        Add New Candidate
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button
          type="button"
          className="action-button"
          style={{
            fontSize: "12px",
            padding: "6px 12px",
            border:
              bindings.candidateUploadMode === "single"
                ? "2px solid var(--primary-accent)"
                : "1px solid var(--border-subtle)",
          }}
          onClick={() => bindings.setCandidateUploadMode("single")}
        >
          Upload Resume
        </button>
        <button
          type="button"
          className="action-button"
          style={{
            fontSize: "12px",
            padding: "6px 12px",
            border:
              bindings.candidateUploadMode === "bulk"
                ? "2px solid var(--primary-accent)"
                : "1px solid var(--border-subtle)",
          }}
          onClick={() => bindings.setCandidateUploadMode("bulk")}
        >
          Bulk Upload
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "180px" }}>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 500,
              display: "block",
              marginBottom: "4px",
            }}
          >
            Position *
          </label>
          <select
            value={bindings.addCandidateItemId ?? ""}
            onChange={(e) =>
              bindings.setAddCandidateItemId(Number(e.target.value))
            }
            required
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              fontSize: "13px",
            }}
          >
            {bindings.ticket.items.map((it) => (
              <option key={it.numericItemId} value={it.numericItemId}>
                {it.skill} — {it.level}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: "180px" }}>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 500,
              display: "block",
              marginBottom: "4px",
            }}
          >
            Full Name *
          </label>
          <input
            type="text"
            value={bindings.newCandidateName}
            onChange={(e) => bindings.setNewCandidateName(e.target.value)}
            required={bindings.candidateUploadMode === "single"}
            disabled={bindings.candidateUploadMode === "bulk"}
            placeholder="e.g., Tejas Patil"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              fontSize: "13px",
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: "180px" }}>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 500,
              display: "block",
              marginBottom: "4px",
            }}
          >
            Email *
          </label>
          <input
            type="email"
            value={bindings.newCandidateEmail}
            onChange={(e) => bindings.setNewCandidateEmail(e.target.value)}
            required={bindings.candidateUploadMode === "single"}
            disabled={bindings.candidateUploadMode === "bulk"}
            placeholder="tejas@example.com"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              fontSize: "13px",
            }}
          />
        </div>
      </div>
      {bindings.candidateUploadMode === "bulk" && (
        <div style={{ marginBottom: "16px" }}>
          <BulkResumeUploadPanel
            requisitionItemId={bindings.addCandidateItemId}
            disabled={bindings.addingCandidate}
            onCompleted={() => {
              void (async () => {
                void bindings.loadCandidates();
                void bindings.loadPipelineCompact();
                if (!bindings.addCandidateItemId) return;

                // Use the same proven flow as single-candidate add:
                // recompute ranking snapshot -> evaluate all present candidates.
                await recomputeRequisitionItemRanking(bindings.addCandidateItemId);
                const nextRanking = await fetchRequisitionItemRanking(
                  bindings.addCandidateItemId,
                  { aiEval: false },
                );
                const ids = Array.from(
                  new Set(
                    (nextRanking?.ranked_candidates ?? []).map(
                      (rc) => rc.candidate_id,
                    ),
                  ),
                );
                if (ids.length > 0) {
                  await runAiEvaluationForRequisitionItem(bindings.addCandidateItemId, {
                    candidate_ids: ids,
                    force: false,
                  });
                }

                // If user is viewing ATS for the same item, refresh board immediately.
                if (bindings.rankingItemId === bindings.addCandidateItemId) {
                  await bindings.loadRanking(false);
                  // Final reconciliation pass for late writes from worker/DB.
                  await new Promise((resolve) => setTimeout(resolve, 2500));
                  await bindings.loadRanking(false);
                }
              })();
            }}
          />
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "180px" }}>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 500,
              display: "block",
              marginBottom: "4px",
            }}
          >
            Phone
          </label>
          <input
            type="tel"
            value={bindings.newCandidatePhone}
            onChange={(e) => bindings.setNewCandidatePhone(e.target.value)}
            placeholder="+91-XXXXXXXXXX"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              fontSize: "13px",
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: "180px" }}>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 500,
              display: "block",
              marginBottom: "4px",
            }}
          >
            Resume (PDF/DOC)
          </label>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => bindings.setResumeFile(e.target.files?.[0] ?? null)}
            style={{ width: "100%", padding: "6px", fontSize: "12px" }}
          />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "140px" }}>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 500,
              display: "block",
              marginBottom: "4px",
            }}
          >
            Years experience (ATS)
          </label>
          <input
            type="number"
            min={0}
            max={80}
            step={0.5}
            value={bindings.newCandidateExp}
            onChange={(e) => bindings.setNewCandidateExp(e.target.value)}
            placeholder="e.g. 5"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              fontSize: "13px",
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: "140px" }}>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 500,
              display: "block",
              marginBottom: "4px",
            }}
          >
            Notice (days)
          </label>
          <input
            type="number"
            min={0}
            max={365}
            value={bindings.newCandidateNotice}
            onChange={(e) => bindings.setNewCandidateNotice(e.target.value)}
            placeholder="0 = immediate"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              fontSize: "13px",
            }}
          />
        </div>
        <div
          style={{
            flex: "1 1 200px",
            display: "flex",
            alignItems: "flex-end",
            paddingBottom: "4px",
          }}
        >
          <label
            style={{
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={bindings.newCandidateReferral}
              onChange={(e) => bindings.setNewCandidateReferral(e.target.checked)}
            />
            Referral (ATS bonus)
          </label>
        </div>
      </div>
      <div style={{ marginBottom: "16px" }}>
        <label
          style={{
            fontSize: "12px",
            fontWeight: 500,
            display: "block",
            marginBottom: "4px",
          }}
        >
          Skills (comma-separated, ATS)
        </label>
        <input
          type="text"
          value={bindings.newCandidateSkills}
          onChange={(e) => bindings.setNewCandidateSkills(e.target.value)}
          placeholder="React, Python, AWS"
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid var(--border-subtle)",
            fontSize: "13px",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          gap: "8px",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          className="action-button"
          style={{ fontSize: "12px", padding: "8px 16px" }}
          onClick={() => {
            bindings.setShowAddCandidate(false);
            bindings.setAddCandidateItemId(null);
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="action-button primary"
          style={{ fontSize: "12px", padding: "8px 16px" }}
          disabled={
            bindings.candidateUploadMode === "bulk"
              ? true
              : bindings.addingCandidate ||
                !bindings.newCandidateName.trim() ||
                !bindings.newCandidateEmail.trim()
          }
        >
          {bindings.addingCandidate ? "Adding..." : "Add Candidate"}
        </button>
      </div>
    </form>
  )}
      {children}
    </div>
  );
}
