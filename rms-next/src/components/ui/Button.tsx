"use client";

import React from "react";

type Variant = "primary" | "secondary" | "danger";
type Size = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl font-semibold outline-none " +
    "transition-colors duration-200 ease-out " +
    "focus-visible:ring-2 focus-visible:ring-accent/25 focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  const sizes: Record<Size, string> = {
    sm: "h-9 px-3 text-sm",
    md: "h-11 px-4 text-sm",
    lg: "h-12 px-5 text-base",
  };

  const variants: Record<Variant, string> = {
    primary:
      "bg-gradient-to-b from-neutral-800 to-black text-white shadow-md hover:from-neutral-900 hover:to-black hover:shadow-lg",
    secondary:
      "border border-border bg-surface text-text shadow-sm hover:bg-slate-100/90 hover:border-slate-300/90",
    danger:
      "bg-danger text-white shadow-md hover:bg-red-700",
  };

  return (
    <button
      {...props}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    />
  );
}

