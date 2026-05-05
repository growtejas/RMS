"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import {
  fetchOrgCandidatesWithCieSummary,
  fetchCieRecomputeJob,
  requestCieRecompute,
  type Candidate,
} from "@/lib/api/candidateApi";

export default function CieWorkspace() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const bulkPollGenRef = useRef(0);

  useEffect(
    () => () => {
      bulkPollGenRef.current += 1;
      setBulkBusy(false);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrgCandidatesWithCieSummary();
      setRows(data);
    } catch {
      setError("Unable to load candidates for CIE.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (candidateId: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(candidateId)) n.delete(candidateId);
      else n.add(candidateId);
      return n;
    });
  };

  const runBulkRecompute = async () => {
    if (selected.size === 0) return;
    const gen = ++bulkPollGenRef.current;
    const count = selected.size;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const { bulk_job_id } = await requestCieRecompute(Array.from(selected), false);
      if (gen !== bulkPollGenRef.current) return;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (gen !== bulkPollGenRef.current) return;
        const p = await fetchCieRecomputeJob(bulk_job_id);
        if (gen !== bulkPollGenRef.current) return;
        if (p.status === "completed" || (p.progress_pct ?? 0) >= 100) break;
      }
      if (gen !== bulkPollGenRef.current) return;
      setBulkMsg(`Queued bulk recompute for ${count} candidate(s). Refresh the list to see updates.`);
      setSelected(new Set());
      void load();
    } catch (err) {
      if (gen === bulkPollGenRef.current) {
        setBulkMsg(err instanceof Error ? err.message : "CIE recompute failed.");
      }
    } finally {
      if (gen === bulkPollGenRef.current) {
        setBulkBusy(false);
      }
    }
  };

  const subtitle = useMemo(
    () =>
      "Candidate Intelligence Engine only: review status, recompute reports in bulk, and open per-candidate intelligence. This view does not change pipeline stages.",
    [],
  );

  return (
    <div className="master-data-manager">
      <div className="data-manager-header">
        <h1>Candidate Intelligence (CIE)</h1>
        <p className="subtitle">{subtitle}</p>
      </div>

      <div
        style={{
          marginBottom: "16px",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className="action-button"
          style={{ fontSize: "12px", padding: "8px 14px" }}
          disabled={loading || bulkBusy}
          onClick={() => void load()}
        >
          Reload list
        </button>
        <button
          type="button"
          className="action-button"
          style={{
            fontSize: "12px",
            padding: "8px 14px",
            opacity: selected.size === 0 || bulkBusy ? 0.5 : 1,
          }}
          disabled={selected.size === 0 || bulkBusy}
          onClick={() => void runBulkRecompute()}
        >
          {bulkBusy ? "Running bulk job…" : `Recompute AI report (${selected.size})`}
        </button>
        {bulkMsg ? (
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{bulkMsg}</span>
        ) : null}
      </div>

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Loading…</p>
      ) : error ? (
        <p style={{ fontSize: "13px", color: "var(--error)" }}>{error}</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
          No candidates in your organization yet.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)", width: 44 }} title="Select for bulk recompute">
                  Bulk
                </th>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>Name</th>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>Email</th>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>REQ</th>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>CIE status</th>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const cie = c.cie_intel;
                const lastAt = cie?.last_evaluated_at;
                const conf = cie?.confidence_score;
                const lastErr = cie?.last_error;
                return (
                  <tr
                    key={c.candidate_id}
                    style={{ backgroundColor: "var(--bg-primary)" }}
                  >
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.candidate_id)}
                        onChange={() => toggle(c.candidate_id)}
                        aria-label={`Select ${c.full_name}`}
                      />
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid var(--border-subtle)",
                        fontWeight: 600,
                      }}
                    >
                      {c.full_name}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {c.email}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                        REQ-{c.requisition_id}
                      </span>
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                      {!lastAt ? (
                        <span style={{ color: "var(--text-tertiary)" }}>No report yet</span>
                      ) : (
                        <div>
                          <div style={{ fontSize: "12px" }}>
                            {new Date(lastAt).toLocaleString()}
                          </div>
                          {conf != null ? (
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                              Confidence {(conf * 100).toFixed(0)}%
                            </div>
                          ) : null}
                          {lastErr ? (
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--error)",
                                marginTop: "4px",
                                maxWidth: "240px",
                              }}
                              title={lastErr}
                            >
                              Last run error
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                      <Link
                        href={`/ta/cie/candidates/${c.candidate_id}`}
                        className="action-button"
                        style={{ fontSize: "11px", padding: "6px 12px" }}
                      >
                        Open CIE
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
