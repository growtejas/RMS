"use client";

/**
 * Unified analytics filter state hook (Track 1.3).
 *
 * - Reads/writes every analytics filter key from the URL query params.
 * - Supports multi-select arrays (CSV-encoded values like
 *   `requisitionIds=12,18,21`).
 * - Debounces text-style filters (search) so we don't trigger URL writes
 *   on every keystroke.
 * - Exposes `activeBadges` for "X active filters" UI affordances.
 * - Provides `toQueryParams()` so query hooks can emit a stable shape that
 *   only includes implemented filter keys (avoids cache-key churn).
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDebouncedValue } from "@/lib/pagination/use-debounced-value";

export type AnalyticsArrayFilterKey =
  | "requisitionIds"
  | "requisitionItemIds"
  | "department"
  | "recruiterIds"
  | "hiringManagerIds"
  | "source"
  | "pipelineStages"
  | "interviewStage"
  | "location"
  | "employmentType";

export type AnalyticsFilterState = {
  from: string;
  to: string;
  search: string;
  page: number;
  limit: number;
  arrays: Record<AnalyticsArrayFilterKey, string[]>;
};

export const ANALYTICS_ARRAY_FILTER_KEYS: AnalyticsArrayFilterKey[] = [
  "requisitionIds",
  "requisitionItemIds",
  "department",
  "recruiterIds",
  "hiringManagerIds",
  "source",
  "pipelineStages",
  "interviewStage",
  "location",
  "employmentType",
];

const NUMERIC_ARRAY_KEYS = new Set<AnalyticsArrayFilterKey>([
  "requisitionIds",
  "requisitionItemIds",
  "recruiterIds",
  "hiringManagerIds",
]);

function parseCsv(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function parseInteger(raw: string | null, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface UseAnalyticsFiltersOptions {
  /** Optional defaults applied when the URL omits a key. */
  defaultLimit?: number;
  /** Provide page-size options for clamp/UI sync. Mirrors pagination contract. */
  pageSizeOptions?: number[];
}

export function useAnalyticsFilters(opts: UseAnalyticsFiltersOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const defaultLimit = opts.defaultLimit ?? 25;

  const [searchInput, setSearchInput] = useState<string>(() => params.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // Sync local search state when URL search changes externally (e.g. browser nav).
  useEffect(() => {
    const urlSearch = params.get("search") ?? "";
    if (urlSearch !== debouncedSearch && urlSearch !== searchInput) {
      setSearchInput(urlSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const state = useMemo<AnalyticsFilterState>(() => {
    const arrays = {} as Record<AnalyticsArrayFilterKey, string[]>;
    for (const key of ANALYTICS_ARRAY_FILTER_KEYS) {
      arrays[key] = parseCsv(params.get(key));
    }
    return {
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
      search: debouncedSearch.trim(),
      page: parseInteger(params.get("page"), 1),
      limit: parseInteger(params.get("limit"), defaultLimit),
      arrays,
    };
  }, [params, debouncedSearch, defaultLimit]);

  const activeBadges = useMemo(() => {
    const badges: Array<{ key: string; label: string; clear: () => void }> = [];
    if (state.from) badges.push({ key: "from", label: `From ${state.from}`, clear: () => clearKey("from") });
    if (state.to) badges.push({ key: "to", label: `To ${state.to}`, clear: () => clearKey("to") });
    for (const key of ANALYTICS_ARRAY_FILTER_KEYS) {
      const values = state.arrays[key];
      if (values.length > 0) {
        const preview = values.slice(0, 2).join(", ");
        const more = values.length > 2 ? ` +${values.length - 2}` : "";
        badges.push({
          key,
          label: `${key}: ${preview}${more}`,
          clear: () => clearArrayKey(key),
        });
      }
    }
    return badges;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const replaceParams = useCallback(
    (mutator: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutator(next);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, params],
  );

  const setRangeStart = useCallback(
    (value: string) => {
      replaceParams((next) => {
        if (value) next.set("from", value);
        else next.delete("from");
        next.set("page", "1");
      });
    },
    [replaceParams],
  );

  const setRangeEnd = useCallback(
    (value: string) => {
      replaceParams((next) => {
        if (value) next.set("to", value);
        else next.delete("to");
        next.set("page", "1");
      });
    },
    [replaceParams],
  );

  const setSearch = useCallback((value: string) => {
    setSearchInput(value);
  }, []);

  // When debounced search settles, propagate to the URL.
  useEffect(() => {
    const urlSearch = params.get("search") ?? "";
    if (urlSearch === debouncedSearch.trim()) return;
    replaceParams((next) => {
      const trimmed = debouncedSearch.trim();
      if (trimmed) next.set("search", trimmed);
      else next.delete("search");
      next.set("page", "1");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const setPage = useCallback(
    (page: number) => {
      replaceParams((next) => next.set("page", String(Math.max(1, Math.floor(page)))));
    },
    [replaceParams],
  );

  const setLimit = useCallback(
    (limit: number) => {
      replaceParams((next) => {
        next.set("limit", String(limit));
        next.set("page", "1");
      });
    },
    [replaceParams],
  );

  const setArrayFilter = useCallback(
    (key: AnalyticsArrayFilterKey, values: string[]) => {
      replaceParams((next) => {
        const cleaned = values.map((v) => v.trim()).filter((v) => v.length > 0);
        if (cleaned.length === 0) {
          next.delete(key);
        } else {
          next.set(key, cleaned.join(","));
        }
        next.set("page", "1");
      });
    },
    [replaceParams],
  );

  const toggleArrayValue = useCallback(
    (key: AnalyticsArrayFilterKey, value: string) => {
      const current = state.arrays[key];
      const trimmed = value.trim();
      if (!trimmed) return;
      const exists = current.includes(trimmed);
      const next = exists ? current.filter((v) => v !== trimmed) : [...current, trimmed];
      setArrayFilter(key, next);
    },
    [setArrayFilter, state.arrays],
  );

  const clearKey = useCallback(
    (key: string) => {
      replaceParams((next) => {
        next.delete(key);
        next.set("page", "1");
      });
    },
    [replaceParams],
  );

  const clearArrayKey = useCallback(
    (key: AnalyticsArrayFilterKey) => clearKey(key),
    [clearKey],
  );

  const resetAll = useCallback(() => {
    replaceParams((next) => {
      next.delete("from");
      next.delete("to");
      next.delete("search");
      next.delete("page");
      next.delete("limit");
      for (const key of ANALYTICS_ARRAY_FILTER_KEYS) next.delete(key);
    });
    setSearchInput("");
  }, [replaceParams]);

  /**
   * Builds a stable, sorted query-param object that downstream React Query
   * hooks turn into a search string. Only emits implemented filter keys so
   * cache keys don't churn when noise filters are typed.
   */
  const toQueryParams = useCallback(
    (extra?: Record<string, string | number | null | undefined>): Record<string, string> => {
      const out: Record<string, string> = {};
      const setIf = (key: string, value: string) => {
        if (value && value.trim() !== "") out[key] = value.trim();
      };
      setIf("from", state.from);
      setIf("to", state.to);
      setIf("search", state.search);
      out.page = String(state.page);
      out.limit = String(state.limit);
      for (const key of ANALYTICS_ARRAY_FILTER_KEYS) {
        const values = state.arrays[key];
        if (values.length === 0) continue;
        const cleaned = NUMERIC_ARRAY_KEYS.has(key)
          ? values
              .map((v) => Number.parseInt(v, 10))
              .filter((v) => Number.isFinite(v) && v > 0)
              .map(String)
          : values;
        if (cleaned.length > 0) out[key] = cleaned.sort().join(",");
      }
      if (extra) {
        for (const [k, v] of Object.entries(extra)) {
          if (v == null) continue;
          const raw = String(v).trim();
          if (raw) out[k] = raw;
        }
      }
      return out;
    },
    [state],
  );

  return {
    state,
    searchInput,
    activeBadges,
    setRangeStart,
    setRangeEnd,
    setSearch,
    setPage,
    setLimit,
    setArrayFilter,
    toggleArrayValue,
    clearKey,
    clearArrayKey,
    resetAll,
    toQueryParams,
  };
}
