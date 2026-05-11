"use client";

import React from "react";

import { PageSizeSelect } from "@/components/ui/PageSizeSelect";
import { Pagination } from "@/components/ui/Pagination";
import {
  PAGE_SIZE_OPTIONS,
  type PageSize,
  type PaginationMeta,
} from "@/lib/pagination/contract";

export interface ListFooterProps {
  pagination: PaginationMeta;
  /** Optional override of the page-size whitelist (must remain a subset of `PAGE_SIZE_OPTIONS`). */
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (limit: PageSize) => void;
  /** Sticks the footer to the bottom of the scroll container. */
  sticky?: boolean;
  /** Hide the page-size select (useful for mobile compact bars). */
  hidePageSize?: boolean;
  className?: string;
}

/**
 * Composite list footer: page-size + range readout + pager.
 *
 * Reads `PaginationMeta` directly so consumers don't recompute totals.
 * Below 768px the layout switches to a stacked compact bar (single row,
 * pager in compact mode, range hidden when total is 0).
 */
export function ListFooter({
  pagination,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  sticky,
  hidePageSize,
  className,
}: ListFooterProps) {
  const { page, limit, total, totalPages } = pagination;
  const startIndex = total === 0 ? 0 : (page - 1) * limit + 1;
  const endIndex = total === 0 ? 0 : Math.min(total, startIndex + limit - 1);

  const stickyClass = sticky
    ? "sticky bottom-0 z-10 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]"
    : "";

  return (
    <div
      role="navigation"
      aria-label="List pagination footer"
      className={[
        "mt-3 flex flex-wrap items-center justify-between gap-3 px-1 py-2",
        stickyClass,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-wrap items-center gap-3">
        {!hidePageSize ? (
          <PageSizeSelect
            value={limit}
            options={pageSizeOptions}
            onChange={(n) => onPageSizeChange(n as PageSize)}
          />
        ) : null}
        <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
          {total === 0
            ? "No results"
            : `Showing ${startIndex.toLocaleString()}–${endIndex.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
      </div>
      <div className="hidden md:block">
        <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
      </div>
      <div className="block md:hidden">
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={onPageChange}
          compact
        />
      </div>
    </div>
  );
}
