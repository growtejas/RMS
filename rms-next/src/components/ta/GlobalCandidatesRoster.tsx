"use client";

import Link from "next/link";
import React, { Suspense, useEffect, useMemo, useState } from "react";

import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListError } from "@/components/ui/ListError";
import { ListFooter } from "@/components/ui/ListFooter";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import { fetchCandidatesPage, type Candidate } from "@/lib/api/candidateApi";
import { useDebouncedValue } from "@/lib/pagination/use-debounced-value";
import { useListUrlState } from "@/lib/pagination/use-list-url-state";
import { usePaginatedList } from "@/lib/pagination/use-paginated-list";
import { type PageSize } from "@/lib/pagination/contract";
import { qk } from "@/lib/query/keys";

type PersonRow = {
  personKey: number;
  displayName: string;
  email: string;
  candidates: Candidate[];
};

function aggregateByPerson(rows: Candidate[]): PersonRow[] {
  const map = new Map<number, PersonRow>();
  for (const c of rows) {
    const personKey = c.person_id ?? c.candidate_id;
    const existing = map.get(personKey);
    if (existing) {
      existing.candidates.push(c);
    } else {
      map.set(personKey, {
        personKey,
        displayName: c.full_name,
        email: c.email,
        candidates: [c],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    }),
  );
}

function GlobalCandidatesRosterInner() {
  const { state, setPage, setLimit, setSearch, resetFilters } =
    useListUrlState<Record<string, never>>({ filterKeys: [] });

  const [searchDraft, setSearchDraft] = useState(state.q);
  const debouncedSearch = useDebouncedValue(searchDraft, 250);
  useEffect(() => {
    setSearchDraft(state.q);
  }, [state.q]);
  useEffect(() => {
    if (debouncedSearch.trim() === state.q) return;
    setSearch(debouncedSearch.trim());
  }, [debouncedSearch, state.q, setSearch]);

  const queryParams = useMemo(
    () => ({ page: state.page, limit: state.limit, q: state.q || null }),
    [state.page, state.limit, state.q],
  );

  const list = usePaginatedList<Candidate>({
    queryKey: qk.candidates.list(queryParams),
    fetcher: ({ signal }) =>
      fetchCandidatesPage({
        page: state.page,
        limit: state.limit,
        q: state.q || null,
        signal,
      }),
  });

  useEffect(() => {
    if (list.pagination.totalPages > 0 && list.pagination.page !== state.page) {
      setPage(list.pagination.page);
    }
  }, [list.pagination.totalPages, list.pagination.page, state.page, setPage]);

  const personRows = useMemo(() => aggregateByPerson(list.items), [list.items]);

  return (
    <div className="master-data-manager">
      <div className="data-manager-header">
        <h1>Candidates (Global)</h1>
        <p className="subtitle">
          Organization-wide candidate roster. Open a requisition to add or move candidates.
        </p>
      </div>

      <div
        style={{
          marginBottom: "16px",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "flex-end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Search name / email</span>
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Type to filter…"
            className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
            style={{ minWidth: "220px" }}
          />
        </label>
        {state.q ? (
          <button
            type="button"
            className="action-button"
            style={{ fontSize: "12px", padding: "6px 12px" }}
            onClick={() => {
              resetFilters();
              setSearchDraft("");
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {list.isLoading ? (
        <ListSkeleton rows={state.limit} />
      ) : list.isError ? (
        <ListError onRetry={() => void list.refetch()} />
      ) : list.pagination.total === 0 ? (
        <ListEmpty
          title={state.q ? "No matching candidates" : "No candidates yet"}
          description={
            state.q
              ? "Try a different name or email, or clear the search."
              : "Once candidates are added to your organization they will appear here."
          }
          action={
            state.q ? (
              <button
                type="button"
                className="action-button"
                style={{ fontSize: "12px", padding: "6px 12px" }}
                onClick={() => {
                  resetFilters();
                  setSearchDraft("");
                }}
              >
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                    Name
                  </th>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                    Email
                  </th>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                    Applications
                  </th>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                    Requisitions
                  </th>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {personRows.map((r) => {
                  const reqIds = Array.from(
                    new Set(r.candidates.map((c) => c.requisition_id)),
                  ).sort((a, b) => a - b);
                  const stages = Array.from(
                    new Set(r.candidates.map((c) => c.current_stage)),
                  ).join(", ");
                  return (
                    <tr key={r.personKey} style={{ backgroundColor: "var(--bg-primary)" }}>
                      <td
                        style={{
                          padding: "10px",
                          borderBottom: "1px solid var(--border-subtle)",
                          fontWeight: 600,
                        }}
                      >
                        {r.displayName}
                      </td>
                      <td
                        style={{
                          padding: "10px",
                          borderBottom: "1px solid var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {r.email}
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                        {r.candidates.length}
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-tertiary)",
                            marginTop: "4px",
                          }}
                        >
                          Stages: {stages || "—"}
                        </div>
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                        {reqIds.map((id) => (
                          <Link
                            key={id}
                            href={`/ta/requisitions/${id}`}
                            style={{
                              display: "inline-block",
                              marginRight: "8px",
                              fontSize: "12px",
                              color: "var(--primary-accent)",
                            }}
                          >
                            REQ-{id}
                          </Link>
                        ))}
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                        {reqIds[0] != null ? (
                          <Link
                            href={`/ta/requisitions/${reqIds[0]}`}
                            className="action-button"
                            style={{ fontSize: "11px", padding: "6px 12px" }}
                          >
                            Open requisition
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ListFooter
            pagination={list.pagination}
            onPageChange={setPage}
            onPageSizeChange={(n: PageSize) => setLimit(n)}
          />
        </>
      )}
    </div>
  );
}

export default function GlobalCandidatesRoster() {
  return (
    <Suspense
      fallback={<p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Loading candidates…</p>}
    >
      <GlobalCandidatesRosterInner />
    </Suspense>
  );
}
