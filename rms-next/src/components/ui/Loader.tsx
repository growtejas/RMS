"use client";

import React from "react";

type LoaderProps = {
  label?: string;
};

export function Loader({ label = "Loading..." }: LoaderProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-slate-600"
      role="status"
      aria-live="polite"
    >
      <span
        className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700"
        aria-hidden
      />
      <span className="text-center">{label}</span>
    </div>
  );
}
