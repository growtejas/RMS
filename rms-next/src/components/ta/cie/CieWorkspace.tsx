"use client";

import Link from "next/link";
import React, {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListError } from "@/components/ui/ListError";
import { ListFooter } from "@/components/ui/ListFooter";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import { CieBulkActionsBar } from "@/components/ta/cie/CieBulkActionsBar";
import {
  fetchCieCandidatesPage,
  fetchCieRoleCatalog,
  type Candidate,
  type CieCandidateSort,
} from "@/lib/api/candidateApi";
import { useSelectionModel } from "@/lib/cie/use-selection-model";
import { useDebouncedValue } from "@/lib/pagination/use-debounced-value";
import { useListUrlState } from "@/lib/pagination/use-list-url-state";
import { usePaginatedList } from "@/lib/pagination/use-paginated-list";
import { type PageSize } from "@/lib/pagination/contract";
import { qk } from "@/lib/query/keys";
import { findRoleIdsForQuery, getRoleById } from "@/lib/services/cie/role-catalog";
import type { RoleMaster } from "@/lib/services/cie/role-catalog";

type CieFilters = { role: string };

const SORT_OPTIONS: { value: CieCandidateSort; label: string }[] = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "last_evaluated_desc", label: "Last CIE report" },
];

const SORT_VALUES = new Set(SORT_OPTIONS.map((o) => o.value));

const CieRow = memo(function CieRow({
  c,
  selected,
  onToggle,
}: {
  c: Candidate;
  selected: boolean;
  onToggle: (id: number) => void;
}) {
  const cie = c.cie_intel;
  const lastAt = cie?.last_evaluated_at;
  const conf = cie?.confidence_score;
  const lastErr = cie?.last_error;
  const roles = cie?.latest_report?.suitableRoles ?? [];
  return (
    <tr style={{ backgroundColor: "var(--bg-primary)" }}>
      <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(c.candidate_id)}
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
            <div style={{ fontSize: "12px" }}>{new Date(lastAt).toLocaleString()}</div>
            {conf != null ? (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  marginTop: "4px",
                }}
              >
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
      <td
        style={{
          padding: "10px",
          borderBottom: "1px solid var(--border-subtle)",
          maxWidth: "280px",
        }}
      >
        {roles.length === 0 ? (
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>—</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {roles.slice(0, 4).map((r) => (
              <Link
                key={r.roleId}
                href={`/ta/cie?role=${encodeURIComponent(r.roleId)}`}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800 hover:bg-slate-200"
              >
                {r.displayName}
              </Link>
            ))}
            {roles.length > 4 ? (
              <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                +{roles.length - 4}
              </span>
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
});

function CieWorkspaceInner() {
  const { state, setPage, setLimit, setSearch, setSort, setFilters, resetFilters } =
    useListUrlState<CieFilters>({
      filterKeys: ["role"],
      defaultSort: "created_desc",
    });

  const sort: CieCandidateSort = SORT_VALUES.has(state.sort as CieCandidateSort)
    ? (state.sort as CieCandidateSort)
    : "created_desc";

  const [searchDraft, setSearchDraft] = useState(state.q);
  const debouncedSearch = useDebouncedValue(searchDraft, 250);

  useEffect(() => {
    setSearchDraft(state.q);
  }, [state.q]);

  useEffect(() => {
    const d = debouncedSearch.trim();
    if (d === state.q) return;
    setSearch(d);
  }, [debouncedSearch, state.q, setSearch]);

  const queryParams = useMemo(
    () => ({
      page: state.page,
      limit: state.limit,
      q: state.q || null,
      role: state.filters.role || null,
      sort,
    }),
    [state.page, state.limit, state.q, state.filters.role, sort],
  );

  const list = usePaginatedList<Candidate>({
    queryKey: qk.candidates.cieList(queryParams),
    fetcher: ({ signal }) =>
      fetchCieCandidatesPage({
        page: state.page,
        limit: state.limit,
        q: state.q || null,
        role: state.filters.role || null,
        sort,
        signal,
      }),
  });

  // Keep the URL in sync with the server-corrected page (e.g. user requested page 99 on a small filter).
  useEffect(() => {
    if (list.pagination.totalPages > 0 && list.pagination.page !== state.page) {
      setPage(list.pagination.page);
    }
  }, [list.pagination.totalPages, list.pagination.page, state.page, setPage]);

  const rows = list.items;

  const rowCacheRef = useRef<Map<number, Candidate>>(new Map());
  useEffect(() => {
    for (const r of rows) {
      rowCacheRef.current.set(r.candidate_id, r);
    }
  }, [rows]);

  const [catalog, setCatalog] = useState<RoleMaster[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const roles = await fetchCieRoleCatalog();
        setCatalog(roles);
      } catch {
        setCatalog([]);
      }
    })();
  }, []);

  const visibleIds = useMemo(() => rows.map((r) => r.candidate_id), [rows]);

  const {
    isSelected,
    toggleRow,
    toggleSelectVisiblePage,
    selectedCount,
    clear,
    selectAllMatching,
    headerCheckboxState,
    excludedIds,
    selectedIds,
    isAllMatchingSelected,
  } = useSelectionModel({
    visibleIds,
    totalMatching: list.pagination.total,
  });

  const headerCbRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = headerCbRef.current;
    if (!el) return;
    el.indeterminate = headerCheckboxState === "indeterminate";
    el.checked = headerCheckboxState === "checked";
  }, [headerCheckboxState, rows]);

  const subtitle =
    "Candidate Intelligence Engine: talent discovery by AI suitable roles, paginated roster, bulk recompute, and per-candidate intelligence.";

  const activeRoleLabel =
    state.filters.role &&
    (getRoleById(state.filters.role)?.displayName ?? state.filters.role.replace(/_/g, " "));

  const roleSuggestions = useMemo(() => {
    if (!searchDraft.trim()) return catalog.slice(0, 12);
    const ids = new Set(findRoleIdsForQuery(searchDraft));
    return catalog.filter((r) => ids.has(r.id)).slice(0, 12);
  }, [catalog, searchDraft]);

  const nVisibleSelected = visibleIds.filter((id) => isSelected(id)).length;

  const rowLookup = useCallback((id: number) => rowCacheRef.current.get(id), []);

  const clearFilters = useCallback(() => {
    clear();
    resetFilters();
    setSearchDraft("");
  }, [clear, resetFilters]);

  return (
    <div className="master-data-manager">
      <div className="data-manager-header">
        <h1>Candidate Intelligence (CIE)</h1>
        <p className="subtitle">{subtitle}</p>
      </div>

      <CieBulkActionsBar
        selectedCount={selectedCount()}
        isAllMatchingSelected={isAllMatchingSelected}
        excludedIds={excludedIds}
        selectedIds={selectedIds}
        totalMatching={list.pagination.total}
        filterQ={state.q}
        filterRole={state.filters.role}
        rowLookup={rowLookup}
        disabled={list.isFetching}
        onAfterRecompute={() => {
          clear();
          void list.refetch();
        }}
      />

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
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Suitable role</span>
          <select
            className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
            style={{ minWidth: "200px" }}
            value={state.filters.role}
            onChange={(e) => {
              clear();
              setFilters({ role: e.target.value });
            }}
          >
            <option value="">All roles</option>
            {catalog.map((r) => (
              <option key={r.id} value={r.id}>
                {r.displayName}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Sort</span>
          <select
            className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
            style={{ minWidth: "160px" }}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {state.filters.role ? (
          <div
            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-900"
            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <span>Filtered: {activeRoleLabel}</span>
            <button
              type="button"
              className="rounded-full px-2 py-0.5 hover:bg-blue-100"
              onClick={() => setFilters({ role: "" })}
              aria-label="Clear role filter"
            >
              ✕
            </button>
          </div>
        ) : null}
        {searchDraft.trim() && roleSuggestions.length > 0 ? (
          <div
            style={{
              width: "100%",
              fontSize: "11px",
              color: "var(--text-tertiary)",
            }}
          >
            Quick role match:{" "}
            {roleSuggestions.map((r) => (
              <button
                key={r.id}
                type="button"
                className="mr-2 mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 hover:bg-slate-200"
                onClick={() => setFilters({ role: r.id })}
              >
                {r.displayName}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="action-button"
          style={{ fontSize: "12px", padding: "8px 14px" }}
          disabled={list.isFetching}
          onClick={() => void list.refetch()}
        >
          Reload list
        </button>
      </div>

      {selectedCount() > 0 ? (
        <div
          className="mb-3 flex flex-col gap-3 rounded-lg border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 to-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <div className="min-w-0 text-sm text-slate-800">
            {isAllMatchingSelected ? (
              excludedIds.size === 0 ? (
                <p className="leading-snug">
                  <span className="font-semibold tabular-nums text-indigo-950">
                    All {list.pagination.total}
                  </span>{" "}
                  matching candidate{list.pagination.total === 1 ? "" : "s"} selected.
                </p>
              ) : (
                <p className="leading-snug">
                  <span className="font-semibold tabular-nums text-indigo-950">
                    {selectedCount()}
                  </span>{" "}
                  of {list.pagination.total} matching selected
                  <span className="text-slate-600"> ({excludedIds.size} excluded)</span>.
                </p>
              )
            ) : nVisibleSelected === visibleIds.length && visibleIds.length > 0 ? (
              <p className="leading-snug">
                <span className="font-semibold tabular-nums text-indigo-950">
                  {visibleIds.length}
                </span>{" "}
                candidate{visibleIds.length === 1 ? "" : "s"} selected on this page.
              </p>
            ) : (
              <p className="leading-snug">
                <span className="font-semibold tabular-nums text-indigo-950">
                  {selectedCount()}
                </span>{" "}
                candidate{selectedCount() === 1 ? "" : "s"} selected.
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {!isAllMatchingSelected && list.pagination.total > selectedCount() ? (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                onClick={() => selectAllMatching()}
              >
                Select all {list.pagination.total} matching
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
              onClick={() => clear()}
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      {list.isLoading ? (
        <ListSkeleton rows={state.limit} />
      ) : list.isError ? (
        <ListError onRetry={() => void list.refetch()} />
      ) : list.pagination.total === 0 ? (
        <ListEmpty
          title={state.q || state.filters.role ? "No candidates found." : "No candidates yet"}
          description={
            state.q || state.filters.role
              ? "Try clearing your filters or search."
              : "Once candidates are added to your organization they will appear here."
          }
          action={
            state.q || state.filters.role ? (
              <button
                type="button"
                className="action-button"
                style={{ fontSize: "12px", padding: "6px 12px" }}
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <>
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
                  <th
                    style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)", width: 44 }}
                  >
                    <input
                      ref={headerCbRef}
                      type="checkbox"
                      title="Select rows on this page"
                      onChange={() => toggleSelectVisiblePage()}
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>Name</th>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>Email</th>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>REQ</th>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                    CIE status
                  </th>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                    Suitable roles
                  </th>
                  <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <CieRow
                    key={c.candidate_id}
                    c={c}
                    selected={isSelected(c.candidate_id)}
                    onToggle={toggleRow}
                  />
                ))}
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

export default function CieWorkspace() {
  return (
    <Suspense
      fallback={<p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Loading CIE…</p>}
    >
      <CieWorkspaceInner />
    </Suspense>
  );
}
