"use client";

import type { ReactNode } from "react";

/**
 * Action row: Cancel (secondary) left of Submit (primary); end-aligned with gap — use inside modals/forms.
 */
export function HrFormFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-row flex-wrap items-center justify-end gap-2 pt-4 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/**
 * Supports optional leading destructive/aux block with `danger` flushed start (ml-auto grouping on wider surfaces).
 */
export function HrFormFooterActions({
  danger,
  cancel,
  submit,
  className = "",
}: {
  danger?: ReactNode;
  cancel: ReactNode;
  submit: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex w-full flex-wrap items-center justify-between gap-2 ${className}`.trim()}
    >
      {danger ? <div className="flex min-w-[40%] flex-1">{danger}</div> : null}
      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        {cancel}
        {submit}
      </div>
    </div>
  );
}
