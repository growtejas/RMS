"use client";

import React from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidthClass = "max-w-2xl",
}: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full ${maxWidthClass} rounded-2xl border border-border bg-surface shadow-xl`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              {title ? <h3 className="text-lg font-semibold text-text">{title}</h3> : null}
              {subtitle ? <p className="mt-1 text-sm text-text-muted">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg border border-border bg-surface text-text-muted hover:bg-surface-2"
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-border bg-surface-2 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
