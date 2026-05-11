"use client";

import React from "react";

export interface ListSkeletonProps {
  /** Number of skeleton rows to render. Default 8. */
  rows?: number;
  /** Approximate row height to keep the layout from jumping. */
  rowHeight?: number;
  className?: string;
  /** Show as a list of cards instead of full-width bars. */
  variant?: "table" | "cards";
}

/**
 * Layout-stable skeleton rows for paginated lists.
 *
 * Use while `usePaginatedList().isLoading` is true. When the user
 * navigates to a new page, prefer the previous page's data via React
 * Query's `keepPreviousData` instead of swapping back to the skeleton.
 */
export function ListSkeleton({
  rows = 8,
  rowHeight = 36,
  className,
  variant = "table",
}: ListSkeletonProps) {
  const containerCls =
    variant === "cards"
      ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      : "flex flex-col gap-2";
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={[containerCls, "animate-pulse", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-md bg-[var(--bg-secondary)]"
          style={{ height: rowHeight }}
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
