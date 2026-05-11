/**
 * Canonical pagination contract for every list endpoint and consumer.
 *
 * Single source of truth for:
 *   - Wire-format pagination metadata
 *   - Allowed page sizes (25 / 50 / 100, default 25)
 *   - Server response envelope: { success, data: { items, pagination }, error }
 *
 * All list GET routes MUST emit `PaginatedEnvelope<T>` and all client-side
 * lists MUST consume it. See `paginatedJson` for the server builder and
 * `usePaginatedList` for the client hook.
 */

import type { ApiSuccessEnvelope } from "@/lib/http/api-envelope";

/** Server-computed pagination metadata returned with every paginated list. */
export interface PaginationMeta {
  /** 1-based current page index (clamped into [1, totalPages] when totalPages > 0). */
  page: number;
  /** Server-honored page size (always in `PAGE_SIZE_OPTIONS`). */
  limit: number;
  /** Total rows matching the request filters. */
  total: number;
  /** Total page count (`Math.ceil(total / limit)`, or 0 when total is 0). */
  totalPages: number;
  /** Whether `page + 1` is a valid page. */
  hasNextPage: boolean;
  /** Whether `page - 1` is a valid page. */
  hasPreviousPage: boolean;
}

/** Inner payload for paginated responses. */
export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

/** Full canonical envelope for paginated list responses. */
export type PaginatedEnvelope<T> = ApiSuccessEnvelope<PaginatedData<T>>;

/** Canonical page-size whitelist enforced by both server validators and UI. */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 25;

export const MAX_PAGE_SIZE: PageSize = 100;

export const MIN_PAGE = 1;

/** Type guard for the canonical page-size whitelist. */
export function isPageSize(value: unknown): value is PageSize {
  return (
    typeof value === "number" &&
    (PAGE_SIZE_OPTIONS as readonly number[]).includes(value)
  );
}

/**
 * Compute clamped page + offset given a page request and the total row count.
 * Used by services so that page=999 against an empty filter set returns
 * the first (empty) page rather than throwing.
 */
export function computePagePosition(input: {
  pageRequested: number;
  total: number;
  limit: number;
}): { page: number; offset: number; totalPages: number } {
  const limit = input.limit;
  const total = Math.max(0, Math.floor(input.total));
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  let page = Math.max(1, Math.floor(input.pageRequested));
  if (totalPages > 0) {
    page = Math.min(page, totalPages);
  } else {
    page = 1;
  }
  const offset = totalPages === 0 ? 0 : (page - 1) * limit;
  return { page, offset, totalPages };
}

/** Build the standard `PaginationMeta` block from a service-side count + clamped page. */
export function buildPaginationMeta(input: {
  page: number;
  limit: number;
  total: number;
}): PaginationMeta {
  const { page, totalPages } = computePagePosition({
    pageRequested: input.page,
    total: input.total,
    limit: input.limit,
  });
  return {
    page,
    limit: input.limit,
    total: Math.max(0, Math.floor(input.total)),
    totalPages,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPreviousPage: totalPages > 0 && page > 1,
  };
}
