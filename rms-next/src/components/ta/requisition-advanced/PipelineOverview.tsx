"use client";

import { RefreshCw } from "lucide-react";
import type { PipelineOverviewProps } from "./types";

const STAGES = [
  "Sourced",
  "Shortlisted",
  "Interviewing",
  "Offered",
  "Hired",
  "Rejected",
] as const;

export default function PipelineOverview({
  pipelineLoading,
  pipelineCountByStage,
  expandedPipelineStage,
  onToggleStage,
  onRefresh,
  refreshDisabled,
  pipelineFullLoading,
  expandedStageApplications,
  onOpenStageApplication,
}: PipelineOverviewProps) {
  return (
    <section
      className="mb-5 rounded-xl border p-4"
      style={{
        borderColor: "var(--border-subtle)",
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Pipeline overview
          </h3>
          <p
            className="mt-0.5 text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            Read-only counts by workflow stage. Select a stage to list
            applications.
          </p>
        </div>
        <button
          type="button"
          className="action-button shrink-0 text-[11px]"
          disabled={refreshDisabled}
          onClick={onRefresh}
        >
          <RefreshCw size={12} className="mr-1 inline" />
          Refresh
        </button>
      </div>

      {pipelineLoading ? (
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Loading compact counters…
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {STAGES.map((stage) => {
            const isExpanded = expandedPipelineStage === stage;
            const count = pipelineCountByStage[stage] ?? 0;
            return (
              <button
                key={stage}
                type="button"
                aria-pressed={isExpanded}
                aria-current={isExpanded ? "true" : undefined}
                onClick={() => onToggleStage(stage)}
                className="min-w-[8.25rem] rounded-lg border-2 p-3 text-left transition"
                style={{
                  borderColor: isExpanded
                    ? "var(--primary-accent)"
                    : "var(--border-subtle)",
                  background: isExpanded
                    ? "rgba(59,130,246,0.1)"
                    : "var(--bg-primary)",
                  boxShadow: isExpanded
                    ? "0 0 0 1px rgba(59,130,246,0.25)"
                    : undefined,
                }}
              >
                <div
                  className="text-xs font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {stage}
                </div>
                <div
                  className="text-lg font-bold leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {count}
                </div>
                {isExpanded ? (
                  <div
                    className="mt-1 text-[10px] font-medium"
                    style={{ color: "var(--primary-accent)" }}
                  >
                    Viewing
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {expandedPipelineStage ? (
        <div
          className="mt-3 border-t pt-3"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <p
            className="mb-2 text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
              {expandedPipelineStage}
            </span>{" "}
            — applications
          </p>
          {pipelineFullLoading ? (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Loading full stage details…
            </p>
          ) : expandedStageApplications.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              No applications in this stage.
            </p>
          ) : (
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
              {expandedStageApplications.map((app) => (
                <button
                  key={app.application_id}
                  type="button"
                  onClick={() => onOpenStageApplication(app)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition hover:opacity-95"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {app.candidate.full_name}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {app.candidate.email}
                    </div>
                  </div>
                  <div
                    className="shrink-0 text-[11px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    App #{app.application_id}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
