"use client";

import React from "react";

import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";

export interface PageSizeSelectProps {
  value: number;
  options?: readonly number[];
  onChange: (n: number) => void;
  label?: string;
  className?: string;
}

/**
 * Canonical page-size whitelist 25/50/100 (see `@/lib/pagination/contract`).
 * Callers can pass a narrower `options` prop, but new code should never
 * widen beyond `PAGE_SIZE_OPTIONS`.
 */
const DEFAULT_OPTIONS = PAGE_SIZE_OPTIONS;

export function PageSizeSelect({
  value,
  options = DEFAULT_OPTIONS,
  onChange,
  label = "Show",
  className,
}: PageSizeSelectProps) {
  return (
    <label
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12px" }}
    >
      <span style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm"
        aria-label="Page size"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
