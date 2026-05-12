/**
 * Reusable zod parsers for paginated list query strings.
 *
 * Goals:
 *   - One canonical handling of `page` / `limit` / `q` / `sort` across every list route.
 *   - Soft-defaults (invalid values fall through to defaults) so URL manipulation
 *     never crashes the route. Hard 422s are reserved for "unknown sort" when the
 *     caller opts in via `strictSort: true`.
 *   - Page-size whitelist enforced at the validator layer so services can trust their input.
 */

import { z } from "zod";

import {
  DEFAULT_PAGE_SIZE,
  MIN_PAGE,
  PAGE_SIZE_OPTIONS,
  type PageSize,
} from "@/lib/pagination/contract";

/** `?page=` — soft default to 1 on missing/invalid input. */
export const pageSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return MIN_PAGE;
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    return Number.isFinite(n) && n >= MIN_PAGE ? Math.floor(n) : MIN_PAGE;
  });

/** `?limit=` — soft default to `DEFAULT_PAGE_SIZE`; non-whitelist values fall back to default. */
export const limitSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return DEFAULT_PAGE_SIZE;
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
    return ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
      ? (n as PageSize)
      : DEFAULT_PAGE_SIZE);
  });

/** `?q=` — trims and returns null for empty strings (so services can branch on null). */
export const qSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    return trimmed.length === 0 ? null : trimmed;
  });

/**
 * Build a `?sort=` parser that validates against a route-specific whitelist.
 * Invalid / missing values fall through to `fallback` (no 422).
 */
export function sortSchemaFor<T extends string>(
  allowed: readonly T[],
  fallback: T,
) {
  const allowedSet = new Set<string>(allowed);
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform<T>((v) => {
      if (typeof v !== "string") return fallback;
      const trimmed = v.trim();
      return allowedSet.has(trimmed) ? (trimmed as T) : fallback;
    });
}

/**
 * Common page/limit parsing entrypoint. Returns soft defaults for any route
 * that wants `{ page, limit }` without composing their own zod schema.
 */
export function parsePaginationParams(url: URL): {
  page: number;
  limit: PageSize;
} {
  return {
    page: pageSchema.parse(url.searchParams.get("page")),
    limit: limitSchema.parse(url.searchParams.get("limit")) as PageSize,
  };
}

/**
 * Parses the standard `q` + `page` + `limit` triplet plus an optional `sort`.
 * `sort` is parsed via a route-specific whitelist; if `allowed` is omitted,
 * sort is left undefined.
 */
export function parseListQueryParams<T extends string>(
  url: URL,
  opts?: { sort?: { allowed: readonly T[]; fallback: T } },
): {
  page: number;
  limit: PageSize;
  q: string | null;
  sort: T | null;
} {
  const { page, limit } = parsePaginationParams(url);
  const q = qSchema.parse(url.searchParams.get("q"));
  let sort: T | null = null;
  if (opts?.sort) {
    sort = sortSchemaFor(opts.sort.allowed, opts.sort.fallback).parse(
      url.searchParams.get("sort"),
    );
  }
  return { page, limit, q, sort };
}
