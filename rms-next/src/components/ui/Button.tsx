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
    "inline-flex items-center justify-center rounded-xl font-semibold transition outline-none " +
    "focus-visible:ring-2 focus-visible:ring-accent/25 focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  const sizes: Record<Size, string> = {
    sm: "h-9 px-3 text-sm",
    md: "h-11 px-4 text-sm",
    lg: "h-12 px-5 text-base",
  };

  const variants: Record<Variant, string> = {
    primary:
      "bg-gradient-to-b from-neutral-800 to-black text-white shadow-md hover:-translate-y-px hover:shadow-lg",
    secondary:
      "border border-border bg-surface text-text shadow-sm hover:bg-surface-2",
    danger:
      "bg-danger text-white shadow-md hover:-translate-y-px hover:shadow-lg",
  };

  return (
    <button
      {...props}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    />
  );
}

