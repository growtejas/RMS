"use client";

import { useMemo } from "react";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListError } from "@/components/ui/ListError";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import type { FunnelStageAnalytics } from "@/lib/reports/types";

export interface CandidateFunnelProps {
  rows: FunnelStageAnalytics[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  onSelectStage: (stageKey: string) => void;
  selectedStageKey: string | null;
}

const IDEAL_START_HALF_HEIGHT = 42;
const IDEAL_END_HALF_HEIGHT = 16;
const STAGE_COLORS = [
  "#1e3a8a",
  "#1d4ed8",
  "#2563eb",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#bfdbfe",
  "#dbeafe",
];

/**
 * Funnel visualization with stage bands matching the design brief.
 *
 * The shape updates from live filtered stage counts, so every filter
 * interaction re-renders the funnel geometry.
 */
export function CandidateFunnel(props: CandidateFunnelProps) {
  const { rows, isLoading, isError, onRetry, onSelectStage, selectedStageKey } = props;
  const totalCandidates = useMemo(
    () => rows.reduce((sum, row) => sum + row.count, 0),
    [rows],
  );

  const geometry = useMemo(() => {
    const stageCount = rows.length;
    if (stageCount === 0) return null;

    // Static "ideal" taper sampled on stage boundaries (0..stageCount).
    const boundaryWidths = Array.from({ length: stageCount + 1 }, (_, i) => {
      if (stageCount <= 0) return IDEAL_START_HALF_HEIGHT;
      const t = i / stageCount;
      return IDEAL_START_HALF_HEIGHT - t * (IDEAL_START_HALF_HEIGHT - IDEAL_END_HALF_HEIGHT);
    });
    const segmentWidth = 100 / stageCount;
    const segments = rows.map((row, i) => {
      const x0 = i * segmentWidth;
      const x1 = (i + 1) * segmentWidth;
      const w0 = boundaryWidths[i];
      const w1 = boundaryWidths[i + 1];
      const points = `${x0},${50 - w0} ${x1},${50 - w1} ${x1},${50 + w1} ${x0},${50 + w0}`;
      return {
        key: row.key,
        label: row.stage,
        points,
        color: STAGE_COLORS[i % STAGE_COLORS.length],
      };
    });

    const separators = rows.slice(0, -1).map((_, i) => {
      const x = (i + 1) * segmentWidth;
      return {
        x,
        y1: 50 - boundaryWidths[i + 1],
        y2: 50 + boundaryWidths[i + 1],
      };
    });

    return {
      segments,
      segmentWidth,
      separators,
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>Candidate Lifecycle Funnel</CardTitle>
          <p className="mt-1 text-xs text-text-muted">
            Live funnel by current filters. Click a stage card for drill-down.
          </p>
        </div>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <ListSkeleton rows={6} rowHeight={52} />
        ) : isError ? (
          <ListError onRetry={onRetry} />
        ) : rows.length === 0 || !geometry ? (
          <ListEmpty description="No candidate funnel data for current filters." />
        ) : totalCandidates === 0 ? (
          <ListEmpty description="No candidates found for the selected filters/requisition." />
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-surface-2 p-2">
              <div className="mx-auto w-full max-w-1xl">
                <div className="mb-1 grid" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
                  {rows.map((row) => (
                    <div key={`title-${row.key}`} className="text-center">
                      <p className="text-[11px] font-semibold text-text">{row.stage}</p>
                      <p className="text-[10px] text-text-muted">{row.count.toLocaleString()}</p>
                    </div>
                  ))}
                </div>

                <svg viewBox="0 0 100 100" className="h-[450px] w-full" preserveAspectRatio="none" aria-label="Candidate funnel chart">
                  {rows.map((_, i) => (
                    <rect
                      key={`bg-${i}`}
                      x={i * geometry.segmentWidth}
                      y={0}    
                      width={geometry.segmentWidth}
                      height={100}
                      fill={i % 2 === 0 ? "#eceef2" : "#e4e7ec"}
                    />
                  ))}

                  {geometry.segments.map((seg) => {
                    const isSelected = selectedStageKey === seg.key;
                    return (
                      <polygon
                        key={`seg-${seg.key}`}
                        points={seg.points}
                        fill={seg.color}
                        opacity={isSelected ? 1 : 0.9}
                        onClick={() => onSelectStage(seg.key)}
                        className="cursor-pointer transition-opacity hover:opacity-100"
                      >
                        <title>{`Open ${seg.label} drill-down`}</title>
                      </polygon>
                    );
                  })}

                  {geometry.separators.map((line, i) => (
                    <line
                      key={`sep-${i}`}
                      x1={line.x}
                      y1={line.y1}
                      x2={line.x}
                      y2={line.y2}
                      stroke="#ffffff"
                      strokeWidth={0.35}
                      strokeDasharray="2 2"
                    />
                  ))}

                  {rows.map((row, i) => {
                    const x = i * geometry.segmentWidth + geometry.segmentWidth / 2;
                    return (
                      <text
                        key={`count-${row.key}`}
                        x={x}
                        y={52}
                        textAnchor="middle"
                        fontSize="2.6"
                        fill="#ffffff"
                        fontWeight="700"
                      >
                        {row.count}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>

          </div>
        )}
      </CardBody>
    </Card>
  );
}
