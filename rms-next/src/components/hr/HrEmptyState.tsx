"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function HrEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-border bg-surface/90 px-6 py-12 text-center shadow-sm md:py-14 ${className}`.trim()}
      role="status"
    >
      {Icon ? (
        <Icon
          className="mb-4 h-12 w-12 text-text-muted opacity-60"
          aria-hidden
          strokeWidth={1.25}
        />
      ) : null}
      <h3 className="text-lg font-semibold text-text">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
