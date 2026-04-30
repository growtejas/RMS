"use client";

import type { ReactNode } from "react";

export function HrToolbarCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-4 shadow-sm ${className}`.trim()}
    >
      {children}
    </div>
  );
}
