"use client";

import React from "react";

export function Select({
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none transition " +
        "focus:border-accent/60 focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-60 " +
        className
      }
    />
  );
}
