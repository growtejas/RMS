"use client";

import React, { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { apiClient } from "@/lib/api/client";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListError } from "@/components/ui/ListError";
import { ListFooter } from "@/components/ui/ListFooter";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import {
  DEFAULT_PAGE_SIZE,
  type PageSize,
  type PaginatedEnvelope,
} from "@/lib/pagination/contract";
import { usePaginatedList } from "@/lib/pagination/use-paginated-list";
import { qk } from "@/lib/query/keys";

/**
 * Row shape returned by GET /api/bulk-import (canonical paginated envelope).
 * Mirrors `bulk_import_jobs` columns (snake_case to match the wire format).
 */
interface BulkJobRow {
  id: string;
  organization_id: string | null;
  kind: string;
  status: string;
  payload: Record<string, unknown> | null;
  result_summary: Record<string, unknown> | null;
  error_message: string | null;
  created_by: number | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  queued: "neutral",
  running: "warning",
  succeeded: "success",
  failed: "danger",
  cancelled: "neutral",
};

function statusVariant(status: string | null | undefined): BadgeVariant {
  if (!status) return "neutral";
  return STATUS_BADGE[status.toLowerCase()] ?? "neutral";
}

function formatTs(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function summarizeResult(row: BulkJobRow): string {
  const r = row.result_summary;
  if (!r || typeof r !== "object") return "—";
  const total = (r as Record<string, unknown>).total;
  const ok = (r as Record<string, unknown>).succeeded;
  const failed = (r as Record<string, unknown>).failed;
  const parts: string[] = [];
  if (typeof total === "number") parts.push(`${total} total`);
  if (typeof ok === "number") parts.push(`${ok} succeeded`);
  if (typeof failed === "number") parts.push(`${failed} failed`);
  return parts.length === 0 ? "—" : parts.join(" · ");
}

const BulkOperationHistory: React.FC = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const queryParams = useMemo(() => ({ page, limit }), [page, limit]);

  const list = usePaginatedList<BulkJobRow>({
    queryKey: qk.bulkImport.list(queryParams),
    fetcher: async ({ signal }) => {
      const { data } = await apiClient.get<PaginatedEnvelope<BulkJobRow>>(
        "/bulk-import",
        { params: { page, limit }, signal },
      );
      return (
        data?.data ?? {
          items: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }
      );
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <PageHeader
        title="Bulk Operation History"
        subtitle="Recent bulk-import / bulk-update jobs (newest first)."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCw size={14} className="mr-2" />
            Refresh
          </Button>
        }
      />

      <div className="mt-4">
        {list.isLoading ? (
          <ListSkeleton variant="table" rows={limit} />
        ) : list.isError ? (
          <ListError
            description={
              list.error instanceof Error
                ? list.error.message
                : "Failed to load bulk operation history."
            }
            onRetry={() => list.refetch()}
          />
        ) : list.items.length === 0 ? (
          <ListEmpty
            title="No bulk operations yet"
            description="Background bulk imports and updates will appear here once they run."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Started</TH>
                  <TH>Kind</TH>
                  <TH>Status</TH>
                  <TH>Result</TH>
                  <TH>Updated</TH>
                  <TH>Job ID</TH>
                </TR>
              </THead>
              <TBody>
                {list.items.map((row) => (
                  <TR key={row.id}>
                    <TD>{formatTs(row.created_at)}</TD>
                    <TD className="font-medium">{row.kind}</TD>
                    <TD>
                      <Badge variant={statusVariant(row.status)}>
                        {row.status}
                      </Badge>
                    </TD>
                    <TD>{summarizeResult(row)}</TD>
                    <TD>{formatTs(row.updated_at)}</TD>
                    <TD className="font-mono text-xs text-text-muted">
                      {row.id}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}

        {!list.isLoading && !list.isError && (
          <div className="mt-3">
            <ListFooter
              pagination={list.pagination}
              onPageChange={(next) => setPage(next)}
              onPageSizeChange={(next) => {
                setLimit(next);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkOperationHistory;
