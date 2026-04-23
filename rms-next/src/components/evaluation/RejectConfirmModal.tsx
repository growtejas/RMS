"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type RejectConfirmModalProps = {
  open: boolean;
  candidateName?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export default function RejectConfirmModal({
  open,
  candidateName,
  onConfirm,
  onCancel,
}: RejectConfirmModalProps) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const canConfirm = trimmed.length >= 3;

  const title = useMemo(() => {
    const who = candidateName?.trim();
    return who ? `Reject ${who}?` : "Reject candidate?";
  }, [candidateName]);

  useEffect(() => {
    if (!open) return;
    setReason("");
  }, [open]);

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
      aria-labelledby="reject-confirm-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10060,
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
          maxWidth: 480,
          borderRadius: 12,
          padding: "20px 22px",
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="reject-confirm-title"
          style={{
            margin: "0 0 10px",
            fontSize: 16,
            fontWeight: 800,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h2>

        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            backgroundColor: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
          }}
        >
          <strong style={{ color: "var(--text-primary)" }}>Warning:</strong> Rejecting will move this
          candidate to <strong style={{ color: "var(--text-primary)" }}>Rejected</strong>. Please
          add a reason for audit/history.
        </div>

        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 6,
          }}
          htmlFor="reject-reason"
        >
          Rejection feedback
        </label>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you rejecting this candidate?"
          rows={4}
          style={{
            width: "100%",
            resize: "vertical",
            borderRadius: 10,
            padding: "10px 12px",
            border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            outline: "none",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        />
        {!canConfirm ? (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
            Please enter at least 3 characters.
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
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
            className="action-button"
            onClick={() => {
              if (!canConfirm) return;
              onConfirm(trimmed);
            }}
            style={{
              fontSize: 12,
              padding: "6px 14px",
              backgroundColor: "#ef4444",
              borderColor: "rgba(239, 68, 68, 0.35)",
              color: "white",
              fontWeight: 800,
            }}
          >
            Reject candidate
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

