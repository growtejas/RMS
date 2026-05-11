/**
 * Server-side response builder for the canonical paginated envelope.
 *
 * Every list route should return:
 *   `paginatedJson(items, { page, limit, total })`
 *
 * which produces:
 *   `{ success: true, data: { items, pagination }, error: null }`
 *
 * The page is clamped against the computed `totalPages` so a request with
 * `page=999` against an empty filter does not error: clients see the
 * server-corrected `pagination.page` and resync their URL.
 */

import { envelopeOk } from "@/lib/http/api-envelope";
import {
  buildPaginationMeta,
  type PaginatedEnvelope,
} from "@/lib/pagination/contract";

import type { NextResponse } from "next/server";

/** Build the standard `PaginatedEnvelope<T>` JSON response. */
export function paginatedJson<T>(
  items: T[],
  meta: { page: number; limit: number; total: number },
  init?: ResponseInit,
): NextResponse {
  const pagination = buildPaginationMeta(meta);
  const body: PaginatedEnvelope<T>["data"] = { items, pagination };
  return envelopeOk(body, init);
}
