"use client";

import React, { useMemo, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { Badge } from "@/components/ui/Badge";
import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListError } from "@/components/ui/ListError";
import { ListFooter } from "@/components/ui/ListFooter";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  DEFAULT_PAGE_SIZE,
  type PageSize,
  type PaginatedEnvelope,
} from "@/lib/pagination/contract";
import { usePaginatedList } from "@/lib/pagination/use-paginated-list";
import { qk } from "@/lib/query/keys";

interface ReferralRow {
  candidate_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  current_company: string | null;
  current_stage: string;
  total_experience_years: string | number | null;
  notice_period_days: number | null;
  is_referral: boolean;
  created_at: string | Date | null;
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

const ReferralsList: React.FC = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const queryParams = useMemo(
    () => ({ page, limit, q: debouncedSearch || undefined }),
    [page, limit, debouncedSearch],
  );

  const list = usePaginatedList<ReferralRow>({
    queryKey: qk.referrals.list(queryParams),
    fetcher: async ({ signal }) => {
      const params: Record<string, string | number> = { page, limit };
      if (debouncedSearch) params.q = debouncedSearch;
      const { data } = await apiClient.get<PaginatedEnvelope<ReferralRow>>(
        "/referrals",
        { params, signal },
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
        title="Referrals"
        subtitle="Candidates added via employee referrals (newest first)."
      />

      <div className="mt-4">
        <div className="mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or current company"
            className="w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        {list.isLoading ? (
          <ListSkeleton variant="table" rows={limit} />
        ) : list.isError ? (
          <ListError
            description={
              list.error instanceof Error
                ? list.error.message
                : "Failed to load referrals."
            }
            onRetry={() => list.refetch()}
          />
        ) : list.items.length === 0 ? (
          <ListEmpty
            title="No referrals yet"
            description={
              debouncedSearch
                ? "No referrals match your search."
                : "Referral candidates will appear here once submitted."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Candidate</TH>
                  <TH>Email</TH>
                  <TH>Current Company</TH>
                  <TH>Stage</TH>
                  <TH>Experience</TH>
                  <TH>Added</TH>
                </TR>
              </THead>
              <TBody>
                {list.items.map((row) => (
                  <TR key={row.candidate_id}>
                    <TD className="font-medium">{row.full_name}</TD>
                    <TD>{row.email}</TD>
                    <TD>{row.current_company ?? "—"}</TD>
                    <TD>
                      <Badge variant="neutral">{row.current_stage}</Badge>
                    </TD>
                    <TD>
                      {row.total_experience_years != null
                        ? `${row.total_experience_years} y`
                        : "—"}
                    </TD>
                    <TD>{formatDate(row.created_at)}</TD>
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

export default ReferralsList;
