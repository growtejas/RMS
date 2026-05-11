"use client";

import React, { useMemo, useState } from "react";

import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListError } from "@/components/ui/ListError";
import { ListFooter } from "@/components/ui/ListFooter";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import {
  DEFAULT_PAGE_SIZE,
  buildPaginationMeta,
  type PageSize,
} from "@/lib/pagination/contract";

/**
 * Dev-only smoke route for the shared pagination primitives.
 * Visit `/ta/__pagination-demo` to verify Pagination, PageSizeSelect,
 * ListFooter, ListEmpty, ListError, and ListSkeleton in isolation.
 */
export default function PaginationDemoPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [variant, setVariant] = useState<"data" | "loading" | "empty" | "error">(
    "data",
  );

  const totalRows = 187;
  const items = useMemo(() => {
    if (variant !== "data") return [];
    const start = (page - 1) * limit;
    return Array.from({ length: Math.min(limit, totalRows - start) }).map((_, i) => ({
      id: start + i + 1,
      name: `Demo row ${start + i + 1}`,
    }));
  }, [page, limit, variant]);

  const pagination = buildPaginationMeta({
    page,
    limit,
    total: variant === "empty" ? 0 : totalRows,
  });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Pagination demo</h1>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Internal smoke route for the shared pagination primitives.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["data", "loading", "empty", "error"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVariant(v)}
            className={
              v === variant
                ? "rounded border border-blue-600 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900"
                : "rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
            }
          >
            {v}
          </button>
        ))}
      </div>

      {variant === "loading" ? (
        <ListSkeleton rows={limit} />
      ) : variant === "error" ? (
        <ListError onRetry={() => setVariant("data")} />
      ) : variant === "empty" ? (
        <ListEmpty
          title="No demo rows"
          description="Switch to the data variant to see the table populated."
        />
      ) : (
        <ul className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
          {items.map((item) => (
            <li
              key={item.id}
              className="border-b border-[var(--border-subtle)] px-3 py-2 text-sm last:border-b-0"
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}

      <ListFooter
        pagination={pagination}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setLimit(n);
          setPage(1);
        }}
      />
    </div>
  );
}
