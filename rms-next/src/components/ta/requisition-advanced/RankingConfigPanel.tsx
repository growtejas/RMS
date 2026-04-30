"use client";

import { RefreshCw, Upload } from "lucide-react";
import type { RankingConfigPanelProps } from "./types";

export default function RankingConfigPanel(p: RankingConfigPanelProps) {
  const {
    rankingItemId,
    onLineChange,
    lineOptions,
    onRefreshRanking,
    onRecompute,
    onAiEvalAll,
    rankingLoading,
    rankingRefreshing,
    rankingError,
    rankingData,
    aiEvalWorking,
    canEditPipelineRankingJd,
    useRequisitionJd,
    onUseRequisitionJdChange,
    pipelineJdTextDraft,
    onPipelineJdTextDraftChange,
    rankingRequiredSkillsDraft,
    onRankingRequiredSkillsDraftChange,
    pipelineJdFileInputRef,
    onPickPdfFile,
    onClickUploadPdf,
    onClickRemovePdf,
    pipelineJdUploading,
    pipelineJdSaving,
    onSaveJdSettings,
    pipelineJdMessage,
    pipelineJdFeedback,
    hasAttachedRankingPdf,
    showIgnoredCustomJdNote,
    showCustomPdfNote,
    pipelineRankingTargetItem,
  } = p;

  const scoringBusy = rankingLoading || rankingRefreshing;
  const refreshRankingDisabled = !rankingItemId || scoringBusy;
  const recomputeDisabled = rankingRefreshing || rankingLoading || !rankingItemId;
  const aiEvalDisabled =
    aiEvalWorking || !rankingItemId || rankingLoading || rankingRefreshing;

  const messageBorder =
    pipelineJdFeedback === "success"
      ? "1px solid rgba(16, 185, 129, 0.45)"
      : pipelineJdFeedback === "error"
        ? "1px solid rgba(239, 68, 68, 0.4)"
        : "1px solid var(--border-subtle)";
  const messageBg =
    pipelineJdFeedback === "success"
      ? "rgba(16, 185, 129, 0.08)"
      : pipelineJdFeedback === "error"
        ? "rgba(239, 68, 68, 0.06)"
        : "var(--bg-tertiary)";

  return (
    <section
      className="mb-5 rounded-xl border p-4"
      style={{
        borderColor: "var(--border-subtle)",
        backgroundColor: "var(--bg-secondary)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="mb-1">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Ranking configuration
        </h3>
        <p
          className="text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          Scoring control — keyword, semantic, and business rules for the selected
          line
        </p>
      </div>

      <div
        className="mb-3 flex flex-col gap-1 border-b pb-3 text-xs"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {scoringBusy ? (
          <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
            Scoring in progress…
          </p>
        ) : null}
        {aiEvalWorking ? (
          <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
            AI evaluation running…
          </p>
        ) : null}
        {rankingData && !scoringBusy ? (
          <p style={{ color: "var(--text-secondary)" }}>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              Last computed:
            </span>{" "}
            {new Date(rankingData.generated_at).toLocaleString()} · version{" "}
            {rankingData.ranking_version} · {rankingData.total_candidates} candidates
          </p>
        ) : !rankingData && !rankingError && !rankingLoading && rankingItemId ? (
          <p style={{ color: "var(--text-tertiary)" }}>
            Run refresh or recompute to load scores for this line.
          </p>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label
            className="mb-1 block text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Scoring line (requisition item)
          </label>
          <select
            value={rankingItemId ?? ""}
            onChange={(e) => onLineChange(Number(e.target.value))}
            className="w-full min-w-[200px] max-w-md rounded-lg border px-2.5 py-1.5 text-xs"
            style={{
              borderColor: "var(--border-subtle)",
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
            }}
          >
            {lineOptions.map((item) => (
              <option key={item.numericItemId} value={item.numericItemId}>
                Item #{item.numericItemId} — {item.skill}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="action-button shrink-0 text-[11px]"
          onClick={onRefreshRanking}
          disabled={refreshRankingDisabled}
          title="Reload ranking and bucket scores for this line"
        >
          <RefreshCw size={12} className="mr-1 inline" />
          Refresh data
        </button>
      </div>

      <div
        className="mb-4 border-b pb-4"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <h4
          className="mb-1 text-xs font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Job description source
        </h4>
        <p
          className="mb-2 text-xs leading-relaxed"
          style={{ color: "var(--text-tertiary)" }}
        >
          Optional text or PDF used only to rank candidates for the selected
          item. It does not replace the manager requisition JD on the item.
        </p>
        {!canEditPipelineRankingJd ? (
          <p className="mb-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            TA, HR, Admin, Owner, or Manager role is required to change these
            settings.
          </p>
        ) : null}
        <label className="mb-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={useRequisitionJd}
            disabled={!canEditPipelineRankingJd}
            onChange={(e) => onUseRequisitionJdChange(e.target.checked)}
          />
          <span style={{ color: "var(--text-primary)" }}>
            Use same JD as requisition (manager item + header PDFs)
          </span>
        </label>

        {!useRequisitionJd ? (
          <>
            <textarea
              value={pipelineJdTextDraft}
              onChange={(e) => onPipelineJdTextDraftChange(e.target.value)}
              disabled={!canEditPipelineRankingJd || pipelineJdSaving}
              placeholder="Paste or type a JD for ranking…"
              rows={5}
              className="mb-2 w-full rounded-lg border p-2 text-xs"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)",
                boxSizing: "border-box",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <input
              ref={pipelineJdFileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onPickPdfFile(file);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="action-button text-[11px]"
                disabled={!canEditPipelineRankingJd || pipelineJdUploading}
                onClick={onClickUploadPdf}
              >
                <Upload size={12} className="mr-1 inline" />
                {pipelineJdUploading ? "Uploading…" : "Upload ranking PDF"}
              </button>
              {hasAttachedRankingPdf ? (
                <button
                  type="button"
                  className="action-button text-[11px]"
                  disabled={!canEditPipelineRankingJd || pipelineJdUploading}
                  onClick={onClickRemovePdf}
                >
                  Remove ranking PDF
                </button>
              ) : null}
            </div>
          </>
        ) : null}
        {showIgnoredCustomJdNote ? (
          <p
            className="mt-2 text-xs leading-relaxed"
            style={{ color: "var(--text-tertiary)" }}
          >
            Custom ranking text or PDF is saved but ignored while &quot;Use same
            JD as requisition&quot; is checked.
          </p>
        ) : null}
        {showCustomPdfNote && pipelineRankingTargetItem ? (
          <p
            className="mt-2 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            A custom ranking PDF is attached for this item (combined with the text
            above when both are present).
          </p>
        ) : null}

        <div className="mt-3">
          <label
            className="mb-1 block text-xs font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            ATS required skills (optional)
          </label>
          <p
            className="mb-1.5 text-xs leading-relaxed"
            style={{ color: "var(--text-tertiary)" }}
          >
            Comma-separated list. Overrides Primary/Secondary parsing from item
            requirements when non-empty.
          </p>
          <textarea
            value={rankingRequiredSkillsDraft}
            onChange={(e) => onRankingRequiredSkillsDraftChange(e.target.value)}
            disabled={!canEditPipelineRankingJd || pipelineJdSaving}
            placeholder="e.g. React, Node.js, PostgreSQL"
            rows={2}
            className="w-full rounded-lg border p-2 text-xs"
            style={{
              borderColor: "var(--border-subtle)",
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              boxSizing: "border-box",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </div>
      </div>

      {pipelineJdMessage ? (
        <div
          className="mb-3 rounded-lg px-2.5 py-2 text-xs"
          style={{
            border: messageBorder,
            backgroundColor: messageBg,
            color:
              pipelineJdFeedback === "error"
                ? "var(--error)"
                : "var(--text-secondary)",
          }}
        >
          {pipelineJdMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="action-button primary text-[11px]"
          disabled={
            !canEditPipelineRankingJd ||
            pipelineJdSaving ||
            !pipelineRankingTargetItem
          }
          onClick={onSaveJdSettings}
        >
          {pipelineJdSaving ? "Saving…" : "Save settings"}
        </button>
        <button
          type="button"
          className="action-button text-[11px]"
          onClick={onRecompute}
          disabled={recomputeDisabled}
        >
          {rankingRefreshing ? "Recomputing…" : "Recompute score"}
        </button>
        <button
          type="button"
          className="action-button text-[11px]"
          disabled={aiEvalDisabled}
          onClick={onAiEvalAll}
          title="Runs AI evaluation for all currently ranked candidates and stores results."
        >
          {aiEvalWorking ? "AI evaluating…" : "AI eval (all)"}
        </button>
      </div>

      <div className="mt-4">
        {rankingLoading && !rankingData ? (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Loading ranking…
          </p>
        ) : rankingError ? (
          <p className="text-xs" style={{ color: "var(--error)" }}>
            {rankingError}
          </p>
        ) : !rankingData && !rankingLoading ? (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Ranking not available for this position yet.
          </p>
        ) : rankingData ? (
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Full ranking table is not shown here. Use the quality board above, this
            pipeline overview, and filters below to work candidates.
          </p>
        ) : null}
      </div>
    </section>
  );
}
