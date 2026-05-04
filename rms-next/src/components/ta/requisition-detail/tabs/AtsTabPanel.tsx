"use client";

import React from "react";
import { RefreshCw, UserPlus } from "lucide-react";
import AtsBucketBoard from "@/components/ta/ats/AtsBucketBoard";
import PipelineOverview from "@/components/ta/requisition-advanced/PipelineOverview";
import RankingConfigPanel from "@/components/ta/requisition-advanced/RankingConfigPanel";
import CandidateFiltersBar from "@/components/ta/requisition-advanced/CandidateFiltersBar";

import type { RequisitionPipelineBindings } from "./pipelineTabBindings";

export function AtsTabPanel({ bindings }: { bindings: RequisitionPipelineBindings }) {
  return (
    <>
<div
  style={{
    marginBottom: "18px",
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "center",
  }}
>
  <label
    style={{
      fontSize: "12px",
      fontWeight: 500,
      color: "var(--text-secondary)",
    }}
  >
    Position (line):
  </label>
  <select
    value={bindings.atsBoardItemId ?? ""}
    onChange={(e) => bindings.setAtsBoardItemId(Number(e.target.value))}
    style={{
      padding: "8px 12px",
      borderRadius: "8px",
      border: "1px solid var(--border-subtle)",
      fontSize: "12px",
      backgroundColor: "var(--bg-primary)",
      color: "var(--text-primary)",
      minWidth: "220px",
    }}
  >
    {bindings.ticket.items.map((item) => (
      <option key={item.numericItemId} value={item.numericItemId}>
        {item.skill} — {item.level}
      </option>
    ))}
  </select>
  <button
    type="button"
    className="action-button"
    style={{ fontSize: "11px", padding: "6px 12px" }}
    disabled={!bindings.rankingItemId || bindings.rankingLoading || bindings.rankingRefreshing}
    onClick={() => void bindings.loadRanking(false)}
  >
    <RefreshCw size={12} style={{ marginRight: "4px" }} />
    Refresh buckets
  </button>
</div>

<div
  style={{
    marginBottom: "20px",
    padding: "14px",
    borderRadius: "12px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "var(--bg-secondary)",
  }}
>
  <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
    ATS evaluation board
  </div>
  <p
    style={{
      fontSize: "11px",
      color: "var(--text-tertiary)",
      marginTop: 0,
      marginBottom: "12px",
      lineHeight: 1.45,
    }}
  >
    Click a card for read-only evaluation and shortlist. Interview scheduling
    and pipeline moves are on the Shortlisted and Interviews tabs.
  </p>
  <AtsBucketBoard
    loading={bindings.rankingLoading}
    rankingError={bindings.rankingError}
    bucketsError={bindings.atsBucketsError}
    atsBucketsData={bindings.atsBucketsData}
    scoreByCandidateId={bindings.atsBoardScoreByCandidateId}
    experienceFlagByCandidateId={bindings.atsBoardExperienceFlagByCandidateId}
    requiredExperienceYears={bindings.atsBoardRequiredExperienceYears}
    resolveExperienceFit={bindings.resolveExperienceFitFlag}
    onOpenApp={bindings.openEvaluateFromAtsApp}
    rankingBreakdownSnippet={bindings.rankingBreakdownSnippet}
    onRetryLoad={() => void bindings.loadRanking(false)}
  />
</div>

<details
  open={bindings.pipelineAdvancedOpen}
  onToggle={(e) =>
    bindings.setPipelineAdvancedOpen((e.target as HTMLDetailsElement).open)
  }
  style={{ marginBottom: "8px" }}
>
  <summary
    style={{
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: 600,
      marginBottom: "12px",
      userSelect: "none",
    }}
  >
    Pipeline, ranking, and filters (advanced)
  </summary>

  <PipelineOverview
    pipelineLoading={bindings.pipelineLoading}
    pipelineCountByStage={bindings.pipelineCountByStage}
    expandedPipelineStage={bindings.expandedPipelineStage}
    onToggleStage={(stage) =>
      bindings.setExpandedPipelineStage((prev) =>
        prev === stage ? null : stage,
      )
    }
    onRefresh={bindings.handlePipelineSectionRefresh}
    refreshDisabled={bindings.pipelineLoading}
    pipelineFullLoading={bindings.pipelineFullLoading}
    expandedStageApplications={bindings.expandedStageApplications}
    onOpenStageApplication={bindings.openEvaluateFromPipelineRecord}
  />
  <RankingConfigPanel
    rankingItemId={bindings.rankingItemId}
    onLineChange={bindings.setAtsBoardItemId}
    lineOptions={bindings.requisitionLineOptions}
    onRefreshRanking={() => void bindings.loadRanking(false)}
    onRecompute={() => void bindings.loadRanking(true)}
    onAiEvalAll={() => void bindings.runAiEvalAllPresent()}
    rankingLoading={bindings.rankingLoading}
    rankingRefreshing={bindings.rankingRefreshing}
    rankingError={bindings.rankingError}
    rankingData={bindings.rankingData}
    aiEvalWorking={bindings.aiEvalWorking}
    canEditPipelineRankingJd={bindings.canEditPipelineRankingJd}
    useRequisitionJd={bindings.useRequisitionJd}
    onUseRequisitionJdChange={bindings.setUseRequisitionJd}
    pipelineJdTextDraft={bindings.pipelineJdTextDraft}
    onPipelineJdTextDraftChange={bindings.setPipelineJdTextDraft}
    rankingRequiredSkillsDraft={bindings.rankingRequiredSkillsDraft}
    onRankingRequiredSkillsDraftChange={bindings.setRankingRequiredSkillsDraft}
    pipelineJdFileInputRef={
      bindings.pipelineJdFileInputRef as React.RefObject<HTMLInputElement>
    }
    onPickPdfFile={(file) => void bindings.uploadPipelineRankingJdPdf(file)}
    onClickUploadPdf={() => bindings.pipelineJdFileInputRef.current?.click()}
    onClickRemovePdf={() => void bindings.removePipelineRankingJdPdf()}
    pipelineJdUploading={bindings.pipelineJdUploading}
    pipelineJdSaving={bindings.pipelineJdSaving}
    onSaveJdSettings={() => void bindings.savePipelineRankingJdSettings()}
    pipelineJdMessage={bindings.pipelineJdMessage}
    pipelineJdFeedback={bindings.pipelineJdFeedback}
    hasAttachedRankingPdf={Boolean(
      bindings.pipelineRankingTargetItem?.pipelineJdFileKey,
    )}
    showIgnoredCustomJdNote={bindings.showIgnoredCustomJdNote}
    showCustomPdfNote={
      !bindings.useRequisitionJd &&
      Boolean(bindings.pipelineRankingTargetItem?.pipelineJdFileKey)
    }
    pipelineRankingTargetItem={bindings.pipelineRankingTargetItem}
  />
  <CandidateFiltersBar
    candidateItemFilter={bindings.candidateItemFilter}
    onCandidateItemFilterChange={bindings.setCandidateItemFilter}
    candidateStageFilter={bindings.candidateStageFilter}
    onCandidateStageFilterChange={bindings.setCandidateStageFilter}
    items={bindings.requisitionLineOptions}
    candidates={bindings.candidates}
  />

{/* Candidate cards (Kanban-style by stage) */}
{bindings.candidatesLoading ? (
  <div
    style={{
      padding: "40px",
      textAlign: "center",
      color: "var(--text-tertiary)",
    }}
  >
    Loading candidates...
  </div>
) : bindings.candidates.length === 0 ? (
  <div
    style={{
      padding: "40px",
      textAlign: "center",
      color: "var(--text-tertiary)",
      fontSize: "14px",
    }}
  >
    <UserPlus
      size={32}
      style={{ marginBottom: "8px", opacity: 0.4 }}
    />
    <p>
      No candidates yet. Add your first candidate to start the
      pipeline.
    </p>
  </div>
) : (
  <div
    style={{ display: "flex", flexDirection: "column", gap: "12px" }}
  >
    {bindings.candidates
      .filter((c) => {
        // Item filter
        if (
          bindings.candidateItemFilter !== "all" &&
          c.requisition_item_id !== bindings.candidateItemFilter
        ) {
          return false;
        }
        // Stage filter
        if (
          bindings.candidateStageFilter !== "all" &&
          c.current_stage !== bindings.candidateStageFilter
        ) {
          return false;
        }
        return true;
      })
      .map((c) => {
        const linkedItem = bindings.ticket.items.find(
          (it) => it.numericItemId === c.requisition_item_id,
        );
        const stageColors: Record<
          string,
          { bg: string; text: string }
        > = {
          Sourced: { bg: "rgba(100,116,139,0.1)", text: "#64748b" },
          Shortlisted: {
            bg: "rgba(59,130,246,0.1)",
            text: "#3b82f6",
          },
          Interviewing: {
            bg: "rgba(168,85,247,0.1)",
            text: "#a855f7",
          },
          Offered: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
          Hired: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
          Rejected: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
        };
        const sc =
          stageColors[c.current_stage] ?? stageColors["Sourced"]!;

        return (
          <div
            key={
              c.application_id != null
                ? `app-${c.application_id}`
                : `c-${c.candidate_id}-${c.requisition_item_id}`
            }
            onClick={() => bindings.openCandidateModal(c, "evaluate")}
            style={{
              padding: "16px 20px",
              backgroundColor: "var(--bg-primary)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "8px",
                    background:
                      "linear-gradient(135deg, var(--slate-600), var(--slate-700))",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  {c.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "14px" }}>
                    {c.full_name}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {c.email}
                    {c.phone ? ` • ${c.phone}` : ""}
                  </div>
                  {linkedItem && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-tertiary)",
                        marginTop: "2px",
                      }}
                    >
                      Position: {linkedItem.skill} —{" "}
                      {linkedItem.level}
                    </div>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {c.interviews.length} round
                  {c.interviews.length !== 1 ? "s" : ""}
                </span>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: 600,
                    backgroundColor: sc.bg,
                    color: sc.text,
                  }}
                >
                  {c.current_stage}
                </span>
              </div>
            </div>
          </div>
        );
      })}
  </div>
)}
</details>
    </>
  );
}
