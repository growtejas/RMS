/**
 * Repository helpers for offset/limit pagination.
 *
 * `paginate({ count, page, params })` runs the count and page queries in
 * parallel via `Promise.all`, clamps the page request against the total,
 * and returns `{ items, page, limit, total, totalPages, offset }` so
 * services can hand the result to `paginatedJson` without duplication.
 *
 * The function is intentionally generic over the concrete query layer
 * (Drizzle, raw `pg`, etc.) — callers pass two zero-arg async closures
 * that already encode the WHERE filters, ORDER BY clause, and projection.
 */

import {
  computePagePosition,
  type PageSize,
} from "@/lib/pagination/contract";

export interface PaginateInput<TItem> {
  /** Async closure that runs the COUNT(*) query for the same WHERE clause. */
  count: () => Promise<number>;
  /** Async closure that runs the page query with the given limit + offset. */
  fetchPage: (args: { limit: number; offset: number }) => Promise<TItem[]>;
  /** Requested page (1-based). */
  page: number;
  /** Requested page size. Must be in the canonical whitelist. */
  limit: PageSize;
}

export interface PaginateResult<TItem> {
  items: TItem[];
  page: number;
  limit: PageSize;
  total: number;
  totalPages: number;
  offset: number;
}

/**
 * Standard paginate workflow: count + page in parallel, page-clamped, offset-derived.
 * If `total === 0` the page query is skipped to save a round trip.
 */
export async function paginate<TItem>(
  input: PaginateInput<TItem>,
): Promise<PaginateResult<TItem>> {
  const total = await input.count();
  const { page, offset, totalPages } = computePagePosition({
    pageRequested: input.page,
    total,
    limit: input.limit,
  });
  if (totalPages === 0) {
    return { items: [], page, limit: input.limit, total: 0, totalPages: 0, offset: 0 };
  }
  const items = await input.fetchPage({ limit: input.limit, offset });
  return { items, page, limit: input.limit, total, totalPages, offset };
}

/**
 * Variant that runs `count` and `fetchPage` concurrently. Callers pass an
 * `offsetFor(page)` to compute the offset before total is known. We then
 * clamp on the server with `computePagePosition` so a stale page returns
 * the corrected page metadata to the client.
 */
export async function paginateConcurrent<TItem>(input: {
  count: () => Promise<number>;
  fetchPage: (args: { limit: number; offset: number }) => Promise<TItem[]>;
  page: number;
  limit: PageSize;
}): Promise<PaginateResult<TItem>> {
  const speculativeOffset = Math.max(0, (Math.max(1, input.page) - 1) * input.limit);
  const [total, speculativeItems] = await Promise.all([
    input.count(),
    input.fetchPage({ limit: input.limit, offset: speculativeOffset }),
  ]);
  const { page, offset, totalPages } = computePagePosition({
    pageRequested: input.page,
    total,
    limit: input.limit,
  });
  if (totalPages === 0) {
    return { items: [], page, limit: input.limit, total: 0, totalPages: 0, offset: 0 };
  }
  if (offset === speculativeOffset) {
    return { items: speculativeItems, page, limit: input.limit, total, totalPages, offset };
  }
  const items = await input.fetchPage({ limit: input.limit, offset });
  return { items, page, limit: input.limit, total, totalPages, offset };
}
