"use client";

import React, { useMemo } from "react";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
  /** When true, renders only `< page/total >` with no numbered buttons. Useful below `md`. */
  compact?: boolean;
}

/**
 * Compact pager: < 1 2 3 … 30 > — URL state owned by parent.
 *
 * Pass `compact` to render just `< page/total >` for narrow viewports.
 * Numbers respect `aria-current="page"` for screen readers.
 */
export function Pagination({ page, totalPages, onChange, className, compact }: PaginationProps) {
  const pages = useMemo(() => {
    if (totalPages <= 0) return [] as Array<number | "ellipsis">;
    const out: Array<number | "ellipsis"> = [];
    const add = (p: number | "ellipsis") => {
      if (out.length && out[out.length - 1] === p) return;
      out.push(p);
    };
    const windowStart = Math.max(2, page - 2);
    const windowEnd = Math.min(totalPages - 1, page + 2);
    add(1);
    if (windowStart > 2) add("ellipsis");
    for (let p = windowStart; p <= windowEnd; p++) {
      if (p > 1 && p < totalPages) add(p);
    }
    if (windowEnd < totalPages - 1) add("ellipsis");
    if (totalPages > 1) add(totalPages);
    return out;
  }, [page, totalPages]);

  if (totalPages <= 0) {
    return null;
  }

  const go = (p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    onChange(p);
  };

  if (compact) {
    return (
      <nav
        className={className}
        aria-label="Pagination"
        style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
      >
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 text-xs font-medium disabled:opacity-40"
          aria-label="Previous page"
        >
          &lt;
        </button>
        <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
          {page}/{totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 text-xs font-medium disabled:opacity-40"
          aria-label="Next page"
        >
          &gt;
        </button>
      </nav>
    );
  }

  return (
    <nav
      className={className}
      aria-label="Pagination"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 text-xs font-medium disabled:opacity-40"
        aria-label="Previous page"
      >
        &lt;
      </button>
      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e-${i}`} className="px-1 text-xs text-[var(--text-tertiary)]">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            className={
              p === page
                ? "min-w-[2rem] rounded border border-blue-600 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-900"
                : "min-w-[2rem] rounded border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
            }
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 text-xs font-medium disabled:opacity-40"
        aria-label="Next page"
      >
        &gt;
      </button>
    </nav>
  );
}
