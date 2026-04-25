"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Table, TBody, THead, TD, TH, TR } from "@/components/ui/Table";

type AccessRequestRow = {
  id: string;
  user_id: number;
  username: string;
  is_active: boolean | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by: number | null;
  reviewed_at: string | Date | null;
  created_at: string | Date | null;
};

function fmtTime(v: unknown): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v instanceof Date ? v : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function AccessRequestsManager() {
  const [rows, setRows] = useState<AccessRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [roleCatalog, setRoleCatalog] = useState<string[]>([]);
  const [selected, setSelected] = useState<AccessRequestRow | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users/roles/catalog", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as string[];
      setRoleCatalog(Array.isArray(json) ? json : []);
    } catch {
      setRoleCatalog([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/access-requests?status=${status}`, { cache: "no-store" });
      const json = (await res.json()) as { requests?: AccessRequestRow[]; detail?: string };
      if (!res.ok) {
        throw new Error(json.detail || "Failed to load access requests");
      }
      setRows(json.requests ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeModal = () => {
    setSelected(null);
    setSelectedRoles([]);
    setRejectReason("");
  };

  const approve = async () => {
    if (!selected) return;
    if (selectedRoles.length === 0) {
      setError("Select at least one role to approve.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/access-requests/${selected.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: selectedRoles }),
      });
      const j = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) {
        throw new Error(j.detail || "Approve failed");
      }
      closeModal();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setWorking(false);
    }
  };

  const reject = async () => {
    if (!selected) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/access-requests/${selected.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) {
        throw new Error(j.detail || "Reject failed");
      }
      closeModal();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setWorking(false);
    }
  };

  const statusTabs = useMemo(
    () =>
      (["pending", "approved", "rejected"] as const).map((s) => ({
        key: s,
        label: s === "pending" ? "Pending" : s === "approved" ? "Approved" : "Rejected",
      })),
    [],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-4">
        <div className="text-xl font-bold text-[var(--color-text)]">Access requests</div>
        <div className="text-sm text-[var(--color-text-muted)]">
          Review requests from users without roles / inactive accounts.
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {statusTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatus(t.key)}
            className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${
              status === t.key
                ? "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <Table>
          <THead>
            <TR>
              <TH>User</TH>
              <TH>Message</TH>
              <TH>Created</TH>
              <TH>Status</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <td colSpan={5} className="px-4 py-3">
                  <div className="py-6 text-sm text-[var(--color-text-muted)]">
                    No {status} requests.
                  </div>
                </td>
              </TR>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="font-semibold text-[var(--color-text)]">{r.username}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      user_id={r.user_id} · {r.is_active ? "active" : "inactive"}
                    </div>
                  </TD>
                  <TD>
                    <div className="text-sm text-[var(--color-text)]">
                      {r.message?.trim() ? r.message : <span className="text-[var(--color-text-muted)]">—</span>}
                    </div>
                  </TD>
                  <TD>
                    <div className="text-sm text-[var(--color-text)]">{fmtTime(r.created_at)}</div>
                  </TD>
                  <TD>
                    <div className="text-sm font-semibold text-[var(--color-text)]">{r.status}</div>
                  </TD>
                  <TD>
                    {r.status === "pending" ? (
                      <button
                        type="button"
                        className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95"
                        onClick={() => {
                          setSelected(r);
                          setSelectedRoles([]);
                          setRejectReason("");
                        }}
                      >
                        Review
                      </button>
                    ) : (
                      <span className="text-sm text-[var(--color-text-muted)]">—</span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 px-2 py-6 backdrop-blur-[2px]"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-2 text-lg font-bold text-[var(--color-text)]">Review request</div>
            <div className="mb-4 text-sm text-[var(--color-text-muted)]">
              {selected.username} · {selected.message?.trim() ? selected.message : "No message"}
            </div>

            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Assign roles (approve)
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {(roleCatalog.length ? roleCatalog : ["Employee", "TA", "HR", "Manager", "Admin", "Owner"]).map((role) => {
                const on = selectedRoles.some((r) => r.toLowerCase() === role.toLowerCase());
                return (
                  <button
                    key={role}
                    type="button"
                    className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${
                      on
                        ? "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                    }`}
                    onClick={() =>
                      setSelectedRoles((prev) =>
                        on
                          ? prev.filter((x) => x.toLowerCase() !== role.toLowerCase())
                          : [...prev, role],
                      )
                    }
                  >
                    {role}
                  </button>
                );
              })}
            </div>

            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Reject reason (optional)
            </div>
            <textarea
              className="mb-4 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why are you rejecting this request?"
            />

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-2)] disabled:opacity-60"
                onClick={closeModal}
                disabled={working}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void reject()}
                disabled={working}
              >
                Reject
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void approve()}
                disabled={working}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

