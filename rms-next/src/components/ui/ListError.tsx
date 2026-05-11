"use client";

import React from "react";

export interface ListErrorProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Error placeholder for list views. Renders a polite explanation plus an
 * optional retry button. Use this anywhere a paginated list fails.
 */
export function ListError({
  title = "Unable to load results",
  description = "Something went wrong while fetching the list. Please try again.",
  onRetry,
  className,
}: ListErrorProps) {
  return (
    <div
      role="alert"
      className={[
        "rounded-xl border border-red-200 bg-red-50/60 p-6 text-center",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-base font-semibold text-red-900">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-red-800/80">{description}</p>
      ) : null}
      {onRetry ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-900 shadow-sm hover:bg-red-100"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
