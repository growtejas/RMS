"use client";

import React from "react";

export function Table({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-[--color-border] bg-[--color-surface] shadow-[var(--shadow-sm)] ${className}`}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-[--color-surface-2] text-left text-xs font-semibold uppercase tracking-wide text-[--color-text-subtle]">
      {children}
    </thead>
  );
}

export function TR({
  children,
  className = "",
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <tr
      className={`${hover ? "transition-colors hover:bg-slate-50/70" : ""} ${className}`}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-3 font-semibold ${className}`}>{children}</th>
  );
}

export function TD({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[--color-border]">{children}</tbody>;
}

export function TableSkeleton({
  rows = 6,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="animate-pulse space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <div
              key={c}
              className="h-4 flex-1 rounded bg-slate-200/70"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

