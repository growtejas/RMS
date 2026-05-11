"use client";

import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/Button";
import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import { Pagination } from "@/components/ui/Pagination";
import { VirtualList } from "@/components/ui/VirtualList";
import type { CandidateDrillDownRow } from "@/lib/reports/types";

export interface StageDrilldownDrawerProps {
  open: boolean;
  stageLabel: string | null;
  isFetching: boolean;
  rows: CandidateDrillDownRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number } | null;
  onClose: () => void;
  onPageChange: (page: number) => void;
}

/**
 * Stage drill-down drawer.
 *
 * Server-side paginated and virtualized. Closes when no stage is
 * selected or the parent passes `open=false`.
 */
export function StageDrilldownDrawer(props: StageDrilldownDrawerProps) {
  const { open, stageLabel, isFetching, rows, pagination, onClose, onPageChange } = props;
  return (
    <AnimatePresence>
      {open && stageLabel ? (
        <motion.aside
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          className="fixed inset-y-0 right-0 z-50 w-full max-w-[540px] border-l border-border bg-surface shadow-2xl"
          role="dialog"
          aria-label={`Stage details ${stageLabel}`}
        >
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <p className="text-sm font-semibold text-text">{stageLabel} candidates</p>
              <p className="text-xs text-text-muted">
                {pagination
                  ? `${pagination.total.toLocaleString()} total · page ${pagination.page} of ${pagination.totalPages}`
                  : "Server-paginated drill-down"}
              </p>
            </div>
            <Button variant="secondary" onClick={onClose} aria-label="Close drilldown">
              Close
            </Button>
          </div>
          <div className="p-4">
            {isFetching ? (
              <ListSkeleton rows={10} />
            ) : rows.length === 0 ? (
              <ListEmpty description="No candidates in selected stage." />
            ) : (
              <VirtualList
                items={rows}
                height={520}
                getItemKey={(item) => item.applicationId}
                renderItem={(row) => (
                  <div className="mb-2 rounded-xl border border-border bg-surface-2 p-3 text-xs">
                    <p className="font-semibold text-text">{row.candidateName}</p>
                    <p className="text-text-muted">
                      Recruiter: {row.recruiter ?? "Unassigned"} · Role: {row.rolePosition ?? "n/a"}
                    </p>
                    <p className="text-text-muted">
                      Aging {row.stageAgingDays}d · Score {row.interviewScore ?? "n/a"}
                    </p>
                    {row.rejectionReason ? (
                      <p className="text-text-muted">Reason: {row.rejectionReason}</p>
                    ) : null}
                    <p className="text-text-muted">{row.timelineSummary}</p>
                  </div>
                )}
              />
            )}
            {pagination && pagination.totalPages > 1 ? (
              <div className="mt-3 flex justify-end">
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onChange={onPageChange}
                  compact
                />
              </div>
            ) : null}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
