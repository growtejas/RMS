/**
 * Canonical analytics scope/filter contract.
 *
 * Every report (org-, requisition-, recruiter-, department-, source-scoped)
 * goes through the same `AnalyticsScope`. New scope targets attach via
 * `target` so we can introduce comparison mode and additional report
 * surfaces without rewriting the engine.
 */

export type AnalyticsScopeTarget =
  | { kind: "organization" }
  | { kind: "requisition"; requisitionId: number }
  | { kind: "requisitionItem"; requisitionItemId: number }
  | { kind: "recruiter"; recruiterId: number }
  | { kind: "department"; department: string }
  | { kind: "source"; source: string };

export interface AnalyticsScope {
  organizationId: string;
  target: AnalyticsScopeTarget;
  filters: AnalyticsFilters;
}

export interface AnalyticsFilters {
  /** Inclusive ISO date string (UTC). */
  from: string | null;
  /** Exclusive ISO date string (UTC). Wire treats this inclusive on the server boundary. */
  to: string | null;
  requisitionIds: number[];
  requisitionItemIds: number[];
  department: string[];
  recruiterIds: number[];
  hiringManagerIds: number[];
  source: string[];
  /** Pipeline stage keys (canonical). */
  pipelineStages: string[];
  interviewStage: string[];
  location: string[];
  employmentType: string[];
  /** Free-text candidate search applied to drill-down only. */
  search: string;
  page: number;
  limit: number;
}

export const EMPTY_ANALYTICS_FILTERS: AnalyticsFilters = {
  from: null,
  to: null,
  requisitionIds: [],
  requisitionItemIds: [],
  department: [],
  recruiterIds: [],
  hiringManagerIds: [],
  source: [],
  pipelineStages: [],
  interviewStage: [],
  location: [],
  employmentType: [],
  search: "",
  page: 1,
  limit: 25,
};

/** Canonical, deterministic key for cache segmentation and snapshot keys. */
export function buildScopeCacheKey(scope: AnalyticsScope): string {
  const f = scope.filters;
  const target = scope.target;
  const targetKey =
    target.kind === "organization"
      ? "org"
      : target.kind === "requisition"
        ? `req:${target.requisitionId}`
        : target.kind === "requisitionItem"
          ? `item:${target.requisitionItemId}`
          : target.kind === "recruiter"
            ? `rec:${target.recruiterId}`
            : target.kind === "department"
              ? `dept:${target.department}`
              : `src:${target.source}`;
  const arrJoin = (xs: Array<number | string>) =>
    xs.length === 0
      ? "_"
      : [...xs].map((x) => String(x).trim()).filter(Boolean).sort().join(",");
  return [
    `org:${scope.organizationId}`,
    `t:${targetKey}`,
    `from:${f.from ?? ""}`,
    `to:${f.to ?? ""}`,
    `req:${arrJoin(f.requisitionIds)}`,
    `item:${arrJoin(f.requisitionItemIds)}`,
    `dept:${arrJoin(f.department)}`,
    `rec:${arrJoin(f.recruiterIds)}`,
    `hm:${arrJoin(f.hiringManagerIds)}`,
    `src:${arrJoin(f.source)}`,
    `pl:${arrJoin(f.pipelineStages)}`,
    `iv:${arrJoin(f.interviewStage)}`,
    `loc:${arrJoin(f.location)}`,
    `etype:${arrJoin(f.employmentType)}`,
    `q:${f.search.trim().toLowerCase()}`,
    `p:${f.page}`,
    `l:${f.limit}`,
  ].join("|");
}

/** Apply scope target to the filter set so downstream queries see the right narrowing. */
export function narrowFiltersByTarget(scope: AnalyticsScope): AnalyticsFilters {
  const { target, filters } = scope;
  switch (target.kind) {
    case "requisition":
      return {
        ...filters,
        requisitionIds: filters.requisitionIds.length
          ? filters.requisitionIds
          : [target.requisitionId],
      };
    case "requisitionItem":
      return {
        ...filters,
        requisitionItemIds: filters.requisitionItemIds.length
          ? filters.requisitionItemIds
          : [target.requisitionItemId],
      };
    case "recruiter":
      return {
        ...filters,
        recruiterIds: filters.recruiterIds.length ? filters.recruiterIds : [target.recruiterId],
      };
    case "department":
      return {
        ...filters,
        department: filters.department.length ? filters.department : [target.department],
      };
    case "source":
      return {
        ...filters,
        source: filters.source.length ? filters.source : [target.source],
      };
    case "organization":
    default:
      return filters;
  }
}
