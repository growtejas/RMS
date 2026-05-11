/**
 * In-memory paging helpers.
 *
 * Used by routes whose data sources are small reference tables (skills,
 * departments, locations, company roles, admin user directory, ...) where
 * pushing LIMIT/OFFSET into SQL adds no measurable benefit but the canonical
 * `PaginatedEnvelope<T>` shape is still required.
 *
 * Each helper:
 *   - Detects whether the request is canonical (presence of `page` / valid
 *     `limit`).
 *   - Slices the in-memory dataset using `computePagePosition` (so page=999
 *     against a small list returns the first / empty page rather than 404).
 *   - Builds the canonical envelope via `paginatedJson`.
 */

import { NextResponse } from "next/server";

import {
  PAGE_SIZE_OPTIONS,
  computePagePosition,
} from "@/lib/pagination/contract";
import { parsePaginationParams } from "@/lib/pagination/zod";
import { paginatedJson } from "@/lib/pagination/server";

/** True when caller passed a canonical `?page=` and/or whitelisted `?limit=`. */
export function isCanonicalListRequest(url: URL): boolean {
  if (url.searchParams.has("page")) return true;
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit == null) return false;
  const parsed = Number.parseInt(rawLimit, 10);
  return (
    Number.isFinite(parsed) &&
    (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
  );
}

/** Apply page/limit slicing to an in-memory array and return canonical JSON. */
export function paginateInMemory<T>(
  url: URL,
  items: readonly T[],
): NextResponse {
  const { page: requested, limit } = parsePaginationParams(url);
  const total = items.length;
  const { page, offset } = computePagePosition({
    pageRequested: requested,
    total,
    limit,
  });
  const slice = items.slice(offset, offset + limit);
  return paginatedJson(slice, { page, limit, total });
}
