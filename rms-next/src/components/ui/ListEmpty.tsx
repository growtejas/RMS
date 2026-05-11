"use client";

import React from "react";

export interface ListEmptyProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Empty-state placeholder for lists. Pair with a `Reset filters` button
 * via `action` when the empty result is filter-driven.
 */
export function ListEmpty({
  title = "No results",
  description,
  action,
  className,
}: ListEmptyProps) {
  return (
    <div
      role="status"
      className={[
        "rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-8 text-center",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-base font-semibold text-[var(--text-primary)]">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
