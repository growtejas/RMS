"use client";

/**
 * `usePaginatedList` — canonical React Query hook for every paginated list.
 *
 * Wraps `useQuery` with the conventions every list screen needs:
 *   - Stable query keys via the `qk` factory (caller-supplied).
 *   - `placeholderData: keepPreviousData` so previous page rows stay visible
 *     while the next page loads (no jarring blank table flashes).
 *   - 30s `staleTime` by default (`STALE.list`).
 *   - Consumes the canonical `PaginatedEnvelope<T>` shape and exposes
 *     `items`, `pagination`, plus `isLoading`/`isFetching`/`isError`.
 *   - Honors AbortSignal forwarded by React Query so rapid filter changes
 *     cancel in-flight requests.
 *
 * The hook is intentionally agnostic of *how* the URL state is kept; pair it
 * with `useListUrlState` (URL-driven) or component-local state as needed.
 */

import {
  keepPreviousData,
  useQuery,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";

import type { PaginatedData, PaginationMeta } from "@/lib/pagination/contract";
import { STALE } from "@/lib/query/keys";

export interface PaginatedFetcherArgs {
  signal: AbortSignal | undefined;
}

export type PaginatedFetcher<TItem> = (
  args: PaginatedFetcherArgs,
) => Promise<PaginatedData<TItem>>;

export interface UsePaginatedListOptions<TItem> {
  /** Stable query key from the central `qk` factory. */
  queryKey: QueryKey;
  /**
   * Async fetcher returning `PaginatedData<TItem>`. Implementations should
   * forward `signal` to `apiClient` so cancellation works.
   */
  fetcher: PaginatedFetcher<TItem>;
  /** Disable the query (e.g. when route params are not yet resolved). */
  enabled?: boolean;
  /** Override `staleTime`. Defaults to `STALE.list` (30 s). */
  staleTime?: number;
  /** Refetch on window focus. Defaults to false for paginated lists. */
  refetchOnWindowFocus?: boolean;
  /** Keep previous data on key change. Defaults to true. */
  keepPrevious?: boolean;
  /** Optional escape hatch for less-common React Query options. */
  queryOptions?: Omit<
    UseQueryOptions<PaginatedData<TItem>>,
    "queryKey" | "queryFn" | "placeholderData" | "staleTime"
  >;
}

const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

export function usePaginatedList<TItem>(
  opts: UsePaginatedListOptions<TItem>,
) {
  const query = useQuery<PaginatedData<TItem>>({
    queryKey: opts.queryKey,
    queryFn: ({ signal }) => opts.fetcher({ signal }),
    enabled: opts.enabled ?? true,
    staleTime: opts.staleTime ?? STALE.list,
    refetchOnWindowFocus: opts.refetchOnWindowFocus ?? false,
    placeholderData: (opts.keepPrevious ?? true) ? keepPreviousData : undefined,
    ...opts.queryOptions,
  });

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination ?? EMPTY_PAGINATION;

  return {
    items,
    pagination,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error as Error | null,
    isPending: query.isPending,
    refetch: query.refetch,
    /** True when the next page is being fetched but previous data is still visible. */
    isPaging: query.isFetching && !query.isLoading,
  };
}
