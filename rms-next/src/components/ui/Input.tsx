"use client";

import React from "react";

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none transition " +
        "placeholder:text-text-subtle focus:border-accent/60 focus:ring-2 focus:ring-accent/15 " +
        "disabled:cursor-not-allowed disabled:opacity-60 " +
        className
      }
    />
  );
}

