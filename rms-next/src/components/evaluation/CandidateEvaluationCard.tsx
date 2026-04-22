"use client";

import React, { useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import type { CandidateEvaluationCardProps } from "@/components/evaluation/candidate-evaluation-card.types";
import { bandToUserLabel } from "@/components/evaluation/mapRankedCandidateToEvaluationCard";
import ShortlistConfirmModal from "@/components/evaluation/ShortlistConfirmModal";

export default function CandidateEvaluationCard({
  model,
  onShortlist,
  onReject,
  onViewDetails,
  disabled,
  shortlistDisabledReason,
  readOnly,
}: CandidateEvaluationCardProps) {
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [shortlistBlockedNudge, setShortlistBlockedNudge] = useState(false);

  const aiDisplay =
    model.ai.score != null
      ? `${Math.round(model.ai.score)} — ${model.ai.strengthLabel ?? ""}`.trim()
      : "—";

  return (
    <>
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          padding: "14px 16px",
          backgroundColor: "var(--bg-primary)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {model.fullName}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginTop: 2,
              }}
            >
              {model.fitLabel}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "var(--primary-accent)",
                lineHeight: 1,
              }}
            >
              {model.finalScoreRounded}
            </div>
            {model.aiBlendedRankScoreRounded != null &&
            model.aiBlendedRankScoreRounded !== model.finalScoreRounded ? (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--text-tertiary)",
                  marginTop: 4,
                  maxWidth: 140,
                  lineHeight: 1.3,
                }}
              >
                With AI in rank score: {model.aiBlendedRankScoreRounded}
              </div>
            ) : null}
          </div>
        </div>

        {model.highlights.length > 0 ? (
          <ul
            style={{
              margin: 0,
              paddingLeft: 0,
              listStyle: "none",
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.45,
            }}
          >
            {model.highlights.map((h, i) => (
              <li
                key={`${i}-${h.text.slice(0, 24)}`}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  marginBottom: 6,
                }}
              >
                <span style={{ flexShrink: 0, marginTop: 1 }}>
                  {h.tone === "warning" ? (
                    <AlertTriangle size={14} color="var(--warning, #f59e0b)" />
                  ) : (
                    <Check size={14} color="var(--success, #10b981)" />
                  )}
                </span>
                <span>{h.text}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px 12px",
            fontSize: 12,
          }}
        >
          <div style={{ color: "var(--text-tertiary)" }}>Skills match</div>
          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {bandToUserLabel(model.skillsFit)}
          </div>
          <div style={{ color: "var(--text-tertiary)" }}>Experience fit</div>
          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {bandToUserLabel(model.experienceFit)}
          </div>
          <div style={{ color: "var(--text-tertiary)" }}>AI evaluation</div>
          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {aiDisplay}
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            AI insight
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {(aiExpanded && model.ai.summaryFull
              ? model.ai.summaryFull.split(/\n+/).filter(Boolean)
              : model.ai.summaryLines
            ).map((line, i) => (
              <p key={i} style={{ margin: i === 0 ? "0 0 6px" : "0 0 6px" }}>
                {line}
              </p>
            ))}

            {model.ai.summaryFull &&
            model.ai.summaryFull.trim() !== model.ai.summaryLines.join(" ").trim() ? (
              <button
                type="button"
                className="action-button"
                onClick={() => setAiExpanded((v) => !v)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  marginTop: 4,
                }}
              >
                {aiExpanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>
        </div>

        {model.risks.length > 0 ? (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Risks
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.45,
              }}
            >
              {model.risks.map((r) => (
                <li key={r} style={{ marginBottom: 4 }}>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {model.rankingWhy.length > 0 ? (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Why this rank
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.45,
              }}
            >
              {model.rankingWhy.map((r) => (
                <li key={r} style={{ marginBottom: 4 }}>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!readOnly ? (
          <div
            style={{
              marginTop: 4,
              paddingTop: 10,
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                className="action-button primary"
                aria-disabled={disabled ? true : undefined}
                title={shortlistDisabledReason}
                style={{
                  fontSize: 11,
                  padding: "6px 12px",
                  opacity: disabled ? 0.6 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (disabled) {
                    setShortlistBlockedNudge(true);
                    window.setTimeout(() => setShortlistBlockedNudge(false), 2000);
                    return;
                  }
                  setShortlistOpen(true);
                }}
              >
                Shortlist
              </button>
              <button
                type="button"
                className="action-button"
                style={{ fontSize: 11, padding: "6px 12px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onReject();
                }}
              >
                Reject
              </button>
              <button
                type="button"
                className="action-button"
                style={{ fontSize: 11, padding: "6px 12px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails();
                }}
              >
                View details
              </button>
            </div>

            {disabled && shortlistDisabledReason ? (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  lineHeight: 1.4,
                }}
              >
                {shortlistDisabledReason}
              </div>
            ) : null}

            {shortlistBlockedNudge && disabled && shortlistDisabledReason ? (
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--warning, #f59e0b)" }}>
                Shortlist is blocked: {shortlistDisabledReason}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {!readOnly ? (
        <ShortlistConfirmModal
          open={shortlistOpen}
          reasons={model.shortlistPreview.reasons}
          risk={model.shortlistPreview.risk}
          onCancel={() => setShortlistOpen(false)}
          onConfirm={() => {
            setShortlistOpen(false);
            onShortlist();
          }}
        />
      ) : null}
    </>
  );
}
