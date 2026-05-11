"use client";

import React, { useMemo, useState } from "react";

import {
  fetchMyInterviewerInterviewsPage,
  type Interview,
} from "@/lib/api/candidateApi";
import { InterviewerInterviewCard } from "@/components/interviewer/InterviewerInterviewCard";
import { isSameLocalDay } from "@/components/interviewer/interviewer-views-helpers";
import { ListFooter } from "@/components/ui/ListFooter";
import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListError } from "@/components/ui/ListError";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import {
  DEFAULT_PAGE_SIZE,
  type PageSize,
} from "@/lib/pagination/contract";
import { usePaginatedList } from "@/lib/pagination/use-paginated-list";
import { qk } from "@/lib/query/keys";

export default function InterviewerInterviewsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const queryParams = useMemo(() => ({ page, limit }), [page, limit]);

  const list = usePaginatedList<Interview>({
    queryKey: qk.interviews.myList(queryParams),
    fetcher: ({ signal }) =>
      fetchMyInterviewerInterviewsPage({
        page,
        limit,
        signal: signal ?? undefined,
      }),
  });

  const now = new Date();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <p className="text-sm text-text-muted">
        All interviews where you are assigned as a panelist (
        {list.pagination.total}).
      </p>

      {list.isLoading ? (
        <ListSkeleton variant="cards" rows={limit} />
      ) : list.isError ? (
        <ListError
          title="Failed to load interviews"
          description={
            list.error instanceof Error ? list.error.message : undefined
          }
          onRetry={() => void list.refetch()}
        />
      ) : list.items.length === 0 ? (
        <ListEmpty
          title="No assigned interviews yet"
          description="Interviews you are panelling will show up here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.items.map((iv) => (
            <InterviewerInterviewCard
              key={iv.id}
              interview={iv}
              href={`/interviewer/interviews/${iv.id}`}
              highlightToday={isSameLocalDay(new Date(iv.scheduled_at), now)}
            />
          ))}
        </div>
      )}

      {!list.isLoading && !list.isError && (
        <ListFooter
          pagination={list.pagination}
          onPageChange={(next) => setPage(next)}
          onPageSizeChange={(next) => {
            setLimit(next);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
