"use client";

/**
 * Bidirectional URL <-> list-state hook.
 *
 * Owns:
 *   - Parsing `page`, `limit`, `q`, `sort`, plus arbitrary string filters
 *     out of `useSearchParams()`.
 *   - Encoding state changes back into the URL via `router.replace`
 *     (replace, not push, so the back button still skips list pages).
 *
 * Filters are an arbitrary `Record<string, string | null>`; null/empty
 * strings are dropped from the URL so links stay tidy. Page resets to 1
 * automatically whenever a filter or limit changes.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  DEFAULT_PAGE_SIZE,
  MIN_PAGE,
  PAGE_SIZE_OPTIONS,
  type PageSize,
} from "@/lib/pagination/contract";

export interface ListUrlState<TFilters extends Record<string, string>> {
  page: number;
  limit: PageSize;
  q: string;
  sort: string;
  filters: TFilters;
}

export interface ListUrlStateOptions<TFilters extends Record<string, string>> {
  /** Optional default values applied when the URL omits a key. */
  defaultLimit?: PageSize;
  /** Default sort identifier. Empty string means "server default". */
  defaultSort?: string;
  /** Filter keys + their default values. Determines the typed shape returned. */
  filterKeys: readonly (keyof TFilters & string)[];
  /**
   * Optional override for the base path used when re-encoding the URL.
   * Defaults to `usePathname()` so the same hook can be reused across
   * routes without callers wiring it manually.
   */
  basePath?: string;
}

function parsePage(raw: string | null): number {
  if (raw == null || raw === "") return MIN_PAGE;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= MIN_PAGE ? n : MIN_PAGE;
}

function parseLimit(raw: string | null, fallback: PageSize): PageSize {
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? (n as PageSize)
    : fallback);
}

export function useListUrlState<TFilters extends Record<string, string>>(
  opts: ListUrlStateOptions<TFilters>,
): {
  state: ListUrlState<TFilters>;
  setPage: (page: number) => void;
  setLimit: (limit: PageSize) => void;
  setSearch: (q: string) => void;
  setSort: (sort: string) => void;
  setFilters: (next: Partial<TFilters>) => void;
  resetFilters: () => void;
  buildHref: (next: Partial<ListUrlState<TFilters>>) => string;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const fallbackLimit = opts.defaultLimit ?? DEFAULT_PAGE_SIZE;
  const fallbackSort = opts.defaultSort ?? "";
  const basePath = opts.basePath ?? pathname ?? "/";

  const state = useMemo<ListUrlState<TFilters>>(() => {
    const page = parsePage(params.get("page"));
    const limit = parseLimit(params.get("limit"), fallbackLimit);
    const q = params.get("q")?.trim() ?? "";
    const sort = params.get("sort")?.trim() || fallbackSort;
    const filters = {} as TFilters;
    for (const key of opts.filterKeys) {
      const raw = params.get(key)?.trim() ?? "";
      (filters as Record<string, string>)[key] = raw;
    }
    return { page, limit, q, sort, filters };
  }, [params, opts.filterKeys, fallbackLimit, fallbackSort]);

  const buildHref = useCallback(
    (next: Partial<ListUrlState<TFilters>>): string => {
      const merged: ListUrlState<TFilters> = {
        page: next.page ?? state.page,
        limit: next.limit ?? state.limit,
        q: next.q ?? state.q,
        sort: next.sort ?? state.sort,
        filters: { ...state.filters, ...(next.filters ?? {}) },
      };
      const sp = new URLSearchParams();
      if (merged.page > MIN_PAGE) sp.set("page", String(merged.page));
      if (merged.limit !== fallbackLimit) sp.set("limit", String(merged.limit));
      if (merged.q.trim()) sp.set("q", merged.q.trim());
      if (merged.sort && merged.sort !== fallbackSort) sp.set("sort", merged.sort);
      for (const key of opts.filterKeys) {
        const v = merged.filters[key];
        if (v && String(v).trim() !== "") sp.set(key, String(v).trim());
      }
      const qs = sp.toString();
      return qs ? `${basePath}?${qs}` : basePath;
    },
    [state, opts.filterKeys, fallbackLimit, fallbackSort, basePath],
  );

  const replace = useCallback(
    (href: string) => {
      router.replace(href, { scroll: false });
    },
    [router],
  );

  const setPage = useCallback(
    (page: number) => {
      replace(buildHref({ page: Math.max(MIN_PAGE, Math.floor(page)) }));
    },
    [buildHref, replace],
  );

  const setLimit = useCallback(
    (limit: PageSize) => {
      replace(buildHref({ page: MIN_PAGE, limit }));
    },
    [buildHref, replace],
  );

  const setSearch = useCallback(
    (q: string) => {
      replace(buildHref({ page: MIN_PAGE, q }));
    },
    [buildHref, replace],
  );

  const setSort = useCallback(
    (sort: string) => {
      replace(buildHref({ page: MIN_PAGE, sort }));
    },
    [buildHref, replace],
  );

  const setFilters = useCallback(
    (next: Partial<TFilters>) => {
      replace(buildHref({ page: MIN_PAGE, filters: next as Partial<TFilters> }));
    },
    [buildHref, replace],
  );

  const resetFilters = useCallback(() => {
    const cleared = {} as TFilters;
    for (const key of opts.filterKeys) {
      (cleared as Record<string, string>)[key] = "";
    }
    replace(
      buildHref({
        page: MIN_PAGE,
        q: "",
        sort: fallbackSort,
        filters: cleared as Partial<TFilters>,
      }),
    );
  }, [buildHref, replace, opts.filterKeys, fallbackSort]);

  return { state, setPage, setLimit, setSearch, setSort, setFilters, resetFilters, buildHref };
}

/**
 * Lightweight 250 ms debounce used in tandem with `useListUrlState` to delay
 * search-param writes until the user pauses typing. Lives here so consumers
 * don't reinvent a per-page debounce.
 */
export { useDebouncedValue } from "@/lib/pagination/use-debounced-value";
