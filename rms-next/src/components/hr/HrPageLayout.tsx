"use client";

import type { ReactNode } from "react";

/**
 * Outer spacing wrapper for HR (and reused admin) pages: consistent vertical rhythm below HrHeader.
 */
export default function HrPageLayout({
  children,
  className = "",
  maxWidthClass = "",
}: {
  children: ReactNode;
  className?: string;
  /** Optional width constraint e.g. `max-w-6xl mx-auto w-full` */
  maxWidthClass?: string;
}) {
  return (
    <div
      className={`flex min-w-0 w-full flex-col space-y-4 ${maxWidthClass} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
