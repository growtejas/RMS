"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  getBulkResumeStatus,
  retryFailedBulkResumeUpload,
  startBulkResumeUpload,
  type BulkResumeStatusResult,
} from "@/lib/api/candidateApi";

type BulkResumeUploadPanelProps = {
  requisitionItemId: number | null;
  disabled?: boolean;
  onCompleted?: () => void;
};

const MAX_FILES = 100;
const POLL_MS = 1500;
const MAX_CONSECUTIVE_POLL_ERRORS = 3;
const MAX_POLL_ATTEMPTS = 240;
const MAX_STALLED_POLLS = 40;

export default function BulkResumeUploadPanel({
  requisitionItemId,
  disabled = false,
  onCompleted,
}: BulkResumeUploadPanelProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<BulkResumeStatusResult | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef(false);
  const pollErrorCountRef = useRef(0);
  const pollAttemptRef = useRef(0);
  const stalledPollsRef = useRef(0);
  const lastProcessedRef = useRef<number>(-1);

  const canStart = useMemo(
    () => !disabled && !!requisitionItemId && files.length > 0 && files.length <= MAX_FILES,
    [disabled, requisitionItemId, files.length],
  );
  const isTerminal = useMemo(() => {
    if (!status) return false;
    return (
      status.status === "completed" ||
      status.status === "failed" ||
      status.status === "cancelled" ||
      status.status === "error"
    );
  }, [status]);

  const onFileChange = (list: FileList | null) => {
    const next = Array.from(list ?? []).slice(0, MAX_FILES);
    setFiles(next);
  };

  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const pollStatus = async (id: string) => {
    if (isUnmountedRef.current) {
      return;
    }
    try {
      pollAttemptRef.current += 1;
      if (pollAttemptRef.current > MAX_POLL_ATTEMPTS) {
        setError(
          "Upload is still processing, so automatic polling was stopped to avoid request loops. You can refresh status manually by starting from this operation again.",
        );
        setIsPolling(false);
        return;
      }
      const current = await getBulkResumeStatus(id);
      pollErrorCountRef.current = 0;
      setStatus(current);
      if (current.processed === lastProcessedRef.current) {
        stalledPollsRef.current += 1;
      } else {
        stalledPollsRef.current = 0;
        lastProcessedRef.current = current.processed;
      }
      if (
        current.status === "queued" ||
        current.status === "running" ||
        current.status === "processing"
      ) {
        if (stalledPollsRef.current > MAX_STALLED_POLLS) {
          setError(
            "No progress detected for a while. Polling stopped to prevent infinite requests. Check that the bulk worker is running.",
          );
          setIsPolling(false);
          return;
        }
        pollTimerRef.current = setTimeout(() => {
          void pollStatus(id);
        }, POLL_MS);
        return;
      }
      setIsPolling(false);
      if (
        (current.status === "completed" ||
          current.status === "failed" ||
          current.status === "cancelled" ||
          current.status === "error") &&
        onCompleted
      ) {
        onCompleted();
      }
    } catch (e) {
      pollErrorCountRef.current += 1;
      const base =
        e instanceof Error ? e.message : "Could not fetch upload status";
      if (pollErrorCountRef.current >= MAX_CONSECUTIVE_POLL_ERRORS) {
        setError(
          `${base}. Status polling stopped after repeated failures. If your dev server restarted, start it again and retry.`,
        );
        setIsPolling(false);
        return;
      }
      pollTimerRef.current = setTimeout(() => {
        void pollStatus(id);
      }, POLL_MS);
    }
  };

  const start = async () => {
    if (!canStart || !requisitionItemId || isPolling) return;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setError(null);
    pollErrorCountRef.current = 0;
    pollAttemptRef.current = 0;
    stalledPollsRef.current = 0;
    lastProcessedRef.current = -1;
    setStarting(true);
    setIsPolling(true);
    try {
      const res = await startBulkResumeUpload({
        requisition_item_id: requisitionItemId,
        files,
        duplicate_policy: "skip",
      });
      setOperationId(res.operationId);
      await pollStatus(res.operationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start bulk upload");
      setIsPolling(false);
    } finally {
      setStarting(false);
    }
  };

  const retryFailed = async () => {
    if (!operationId || !status || status.failures.length === 0 || isPolling) {
      return;
    }
    setError(null);
    setRetrying(true);
    try {
      const retried = await retryFailedBulkResumeUpload(operationId);
      setOperationId(retried.operationId);
      pollErrorCountRef.current = 0;
      pollAttemptRef.current = 0;
      stalledPollsRef.current = 0;
      lastProcessedRef.current = -1;
      setIsPolling(true);
      await pollStatus(retried.operationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to retry failed resumes");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "10px",
        padding: "12px",
        background: "var(--bg-primary)",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 600,
          marginBottom: "8px",
          color: "var(--text-secondary)",
        }}
      >
        Bulk upload resumes (PDF/DOC/DOCX, max {MAX_FILES} files)
      </div>
      <input
        type="file"
        multiple
        accept=".pdf,.doc,.docx"
        onChange={(e) => onFileChange(e.target.files)}
        disabled={disabled}
        style={{ width: "100%", fontSize: "12px", marginBottom: "8px" }}
      />
      <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "8px" }}>
        {files.length} file(s) selected
      </div>
      {error ? (
        <div style={{ fontSize: "12px", color: "#dc2626", marginBottom: "8px" }}>{error}</div>
      ) : null}
      {status ? (
        <div style={{ fontSize: "12px", marginBottom: "8px", color: "var(--text-secondary)" }}>
          Status: {status.status} · {status.processed}/{status.total} ({status.progress}%)
          <br />
          Success: {status.success_count} · Failed: {status.failure_count} · Skipped:{" "}
          {status.skipped_count}
          <br />
          ✔ {status.created_count ?? status.success_count} candidates created
          <br />
          ❌{" "}
          {status.failed_count ?? status.failure_count + status.skipped_count} failed
        </div>
      ) : null}
      {isTerminal && status && status.failures.length > 0 ? (
        <div
          style={{
            marginBottom: "8px",
            maxHeight: "180px",
            overflowY: "auto",
            border: "1px solid var(--border-subtle)",
            borderRadius: "8px",
            padding: "8px",
            background: "var(--bg-secondary)",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              marginBottom: "6px",
              color: "var(--text-secondary)",
            }}
          >
            Failure log
          </div>
          {status.failures.map((f, idx) => (
            <div
              key={`${f.file_name ?? "file"}-${idx}`}
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
                marginBottom: "4px",
                wordBreak: "break-word",
              }}
            >
              {f.file_name ?? "unknown file"} → {f.reason ?? "Unknown error"}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
            <button
              type="button"
              className="action-button"
              style={{ fontSize: "12px", padding: "6px 12px" }}
              onClick={() => void retryFailed()}
              disabled={retrying || isPolling}
            >
              {retrying ? "Retrying..." : "Retry failed resumes"}
            </button>
          </div>
        </div>
      ) : null}
      {operationId ? (
        <div style={{ fontSize: "11px", marginBottom: "8px", color: "var(--text-tertiary)" }}>
          Operation ID: {operationId}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="action-button primary"
          style={{ fontSize: "12px", padding: "8px 14px" }}
          onClick={() => void start()}
          disabled={!canStart || starting || isPolling}
        >
          {starting ? "Starting..." : isPolling ? "Polling..." : "Start Bulk Upload"}
        </button>
      </div>
    </div>
  );
}

