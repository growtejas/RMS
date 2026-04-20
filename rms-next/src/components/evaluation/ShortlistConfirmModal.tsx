"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";

export type ShortlistConfirmModalProps = {
  open: boolean;
  title?: string;
  reasons: string[];
  risk?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
};

export default function ShortlistConfirmModal({
  open,
  title = "Shortlist Candidate?",
  reasons,
  risk,
  onConfirm,
  onCancel,
  confirmLabel = "Shortlist",
}: ShortlistConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortlist-confirm-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backgroundColor: "rgba(15, 23, 42, 0.45)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 12,
          padding: "20px 22px",
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="shortlist-confirm-title"
          style={{
            margin: "0 0 14px",
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h2>
        <ul
          style={{
            margin: "0 0 12px",
            paddingLeft: 18,
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          {reasons.map((r) => (
            <li key={r} style={{ marginBottom: 6 }}>
              {r}
            </li>
          ))}
        </ul>
        {risk ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 8,
              backgroundColor: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
            }}
          >
            <strong style={{ color: "var(--text-primary)" }}>Risk: </strong>
            {risk}
          </div>
        ) : (
          <div style={{ marginBottom: 16 }} />
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="action-button"
            onClick={onCancel}
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="action-button primary"
            onClick={onConfirm}
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
