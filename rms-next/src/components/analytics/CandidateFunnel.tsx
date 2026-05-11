"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListError } from "@/components/ui/ListError";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import type { FunnelStageAnalytics } from "@/lib/reports/types";

const STAGE_COLORS = ["#2563eb", "#4f46e5", "#7c3aed", "#9333ea", "#0891b2", "#0d9488", "#16a34a", "#f97316"];

export interface CandidateFunnelProps {
  rows: FunnelStageAnalytics[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  onSelectStage: (stageKey: string) => void;
  selectedStageKey: string | null;
}

/**
 * Dynamic candidate-lifecycle funnel renderer.
 *
 * - Adapts to any number of stages (no hardcoded stage list).
 * - Renders stage labels from the `stage` field which is sourced from
 *   `pipeline_stage_definitions.label`.
 * - Shows aging warnings (returned by the API) when a stage breaches
 *   its dwell-time SLA.
 * - Selecting a stage uses the canonical `key` so drill-down stays stable
 *   across renames.
 */
export function CandidateFunnel(props: CandidateFunnelProps) {
  const { rows, isLoading, isError, onRetry, onSelectStage, selectedStageKey } = props;

  const chartData = useMemo(
    () => rows.map((row) => ({ stage: row.stage, count: row.count })),
    [rows],
  );

  return (
    <Card className="lg:col-span-8">
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>Candidate Lifecycle Funnel</CardTitle>
          <p className="mt-1 text-xs text-text-muted">
            Click a stage card for the drill-down candidate list.
          </p>
        </div>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <ListSkeleton rows={6} rowHeight={52} />
        ) : isError ? (
          <ListError onRetry={onRetry} />
        ) : rows.length === 0 ? (
          <ListEmpty description="No candidate funnel data for current filters." />
        ) : (
          <div className="space-y-3">
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={48} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={index} fill={STAGE_COLORS[index % STAGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((stage) => {
                const isSelected = stage.key === selectedStageKey;
                return (
                  <motion.button
                    whileHover={{ y: -2 }}
                    type="button"
                    key={stage.key}
                    aria-pressed={isSelected}
                    className={`rounded-xl border bg-surface-2 p-3 text-left ${isSelected ? "border-indigo-500 shadow-sm" : "border-border"}`}
                    onClick={() => onSelectStage(stage.key)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-text">{stage.stage}</p>
                      {stage.agingWarning ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-900">
                          aging
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-text-muted">
                      {stage.count.toLocaleString()} candidates · Conv {stage.conversionPct}% · Drop-off {stage.dropOffPct}%
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Avg aging {stage.avgDaysInStage}d · Rejections {stage.rejectionCount}
                      {stage.topRejectionReason ? ` · "${stage.topRejectionReason}"` : ""}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
