/**
 * URL -> AnalyticsFilters parser.
 *
 * Single canonical entry point used by every analytics API route. Accepts
 * both the legacy short keys (`pipeline`, `recruiterIds`) and the
 * normalized analytics keys (`pipelineStages`).
 */

import { EMPTY_ANALYTICS_FILTERS, type AnalyticsFilters } from "@/lib/analytics/utils/scope";
import { MAX_PAGE_SIZE, MIN_PAGE } from "@/lib/pagination/contract";

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function parseCsvInt(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => Number.parseInt(v.trim(), 10))
    .filter((v) => Number.isFinite(v) && v > 0);
}

function parseCsvString(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readParam(url: URL, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value != null && value !== "") return value;
  }
  return null;
}

export function parseReportFilters(url: URL): AnalyticsFilters {
  const page = Math.max(MIN_PAGE, parsePositiveInt(url.searchParams.get("page"), 1));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parsePositiveInt(url.searchParams.get("limit"), 25)),
  );
  return {
    ...EMPTY_ANALYTICS_FILTERS,
    from: parseDate(readParam(url, "from", "fromDate", "startDate")),
    to: parseDate(readParam(url, "to", "toDate", "endDate")),
    requisitionIds: parseCsvInt(readParam(url, "requisitionIds", "requisitionId")),
    requisitionItemIds: parseCsvInt(readParam(url, "requisitionItemIds", "requisitionItemId")),
    department: parseCsvString(readParam(url, "department", "departments")),
    recruiterIds: parseCsvInt(readParam(url, "recruiterIds", "recruiterId")),
    hiringManagerIds: parseCsvInt(readParam(url, "hiringManagerIds", "hiringManagerId")),
    source: parseCsvString(readParam(url, "source", "sources")),
    pipelineStages: parseCsvString(readParam(url, "pipelineStages", "pipeline")),
    interviewStage: parseCsvString(readParam(url, "interviewStage", "interviewStages")),
    location: parseCsvString(readParam(url, "location", "locations")),
    employmentType: parseCsvString(readParam(url, "employmentType", "employmentTypes")),
    search: (url.searchParams.get("search") ?? "").trim(),
    page,
    limit,
  };
}

export type { AnalyticsFilters };
