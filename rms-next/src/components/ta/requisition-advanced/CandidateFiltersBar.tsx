"use client";

import { useMemo } from "react";
import type { Candidate } from "@/lib/api/candidateApi";
import type { RequisitionItemOption } from "./types";

const STAGES = [
  "all",
  "Sourced",
  "Shortlisted",
  "Interviewing",
  "Offered",
  "Hired",
  "Rejected",
] as const;

export type CandidateFiltersBarProps = {
  candidateItemFilter: number | "all";
  onCandidateItemFilterChange: (v: number | "all") => void;
  candidateStageFilter: string;
  onCandidateStageFilterChange: (stage: string) => void;
  items: RequisitionItemOption[];
  candidates: Candidate[];
};

function buildItemMap(candidates: Candidate[]) {
  const m = new Map<number, Candidate[]>();
  for (const c of candidates) {
    const id = c.requisition_item_id;
    if (id == null) continue;
    const arr = m.get(id) ?? [];
    arr.push(c);
    m.set(id, arr);
  }
  return m;
}

export default function CandidateFiltersBar({
  candidateItemFilter,
  onCandidateItemFilterChange,
  candidateStageFilter,
  onCandidateStageFilterChange,
  items,
  candidates,
}: CandidateFiltersBarProps) {
  const byItem = useMemo(() => buildItemMap(candidates), [candidates]);

  const filteredByItem = useMemo(() => {
    if (candidateItemFilter === "all") return candidates;
    return byItem.get(candidateItemFilter) ?? [];
  }, [candidateItemFilter, candidates, byItem]);

  const stageButtons = useMemo(() => {
    return STAGES.map((stage) => {
      const count =
        stage === "all"
          ? filteredByItem.length
          : filteredByItem.filter((c) => c.current_stage === stage).length;
      const isActive = candidateStageFilter === stage;
      const label = stage === "all" ? "All" : stage;
      return { stage, label, count, isActive };
    });
  }, [filteredByItem, candidateStageFilter]);

  return (
    <section
      className="sticky top-0 z-10 mb-5 rounded-xl border px-3 py-3 sm:px-4"
      style={{
        borderColor: "var(--border-subtle)",
        backgroundColor: "var(--bg-primary)",
        boxShadow: "0 1px 0 var(--border-subtle)",
      }}
    >
      <h3
        className="text-sm font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        Filters
      </h3>
      <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
        Applies to the <strong style={{ color: "var(--text-secondary)" }}>candidate list below</strong>
        . When you pick a single position, the quality board line above is updated to match on this
        tab.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label
          className="text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Position
        </label>
        <select
          value={candidateItemFilter === "all" ? "all" : candidateItemFilter}
          onChange={(e) =>
            onCandidateItemFilterChange(
              e.target.value === "all" ? "all" : Number(e.target.value),
            )
          }
          className="min-w-[200px] rounded-lg border px-2.5 py-1.5 text-xs"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <option value="all">All positions</option>
          {items.map((item) => (
            <option key={item.numericItemId} value={item.numericItemId}>
              {item.skill} ({byItem.get(item.numericItemId)?.length ?? 0})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {stageButtons.map(({ stage, label, count, isActive }) => (
          <button
            key={stage}
            type="button"
            onClick={() => onCandidateStageFilterChange(stage)}
            className="rounded-full border-2 px-3.5 py-1.5 text-xs transition"
            style={{
              fontWeight: isActive ? 600 : 400,
              borderColor: isActive
                ? "var(--primary-accent)"
                : "var(--border-subtle)",
              backgroundColor: isActive
                ? "rgba(59,130,246,0.08)"
                : "transparent",
              color: isActive
                ? "var(--primary-accent)"
                : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {label} ({count})
          </button>
        ))}
      </div>
    </section>
  );
}
