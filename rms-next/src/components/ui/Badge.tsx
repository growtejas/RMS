"use client";

import React from "react";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral:
    "bg-[--color-surface-2] text-[--color-text] ring-[--color-border]",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
};

export function Badge({
  children,
  variant = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

