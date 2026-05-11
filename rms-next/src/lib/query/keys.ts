/**
 * Phase 3 - typed React Query key namespace.
 *
 * The keys live in one place so:
 *   1. Mutations can target related caches with `invalidateQueries({ queryKey: qk.requisition.detail(id) })`.
 *   2. Hover prefetch targets are explicit, e.g.
 *      `queryClient.prefetchQuery(qk.ranking.item(itemId))`.
 *   3. We can sweep call sites without grepping for stringly-typed keys.
 *
 * Per-domain `staleTime` defaults follow the plan in section 5:
 *
 *   - rare-change reads (users directory, role catalog, departments): 10 min
 *   - per-requisition metadata: 60 s
 *   - lists / pipeline: 30 s
 *   - ranking snapshots: 30 s, focus refetch off
 */

export const STALE = {
  veryRare: 10 * 60_000,
  perRequisition: 60_000,
  list: 30_000,
  ranking: 30_000,
} as const;

/** Generic params bag accepted by every list-style query key. */
export type ListQueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export const qk = {
  auth: {
    session: () => ["auth", "session"] as const,
  },
  users: {
    list: () => ["users", "list"] as const,
    paginated: (params: ListQueryParams) =>
      ["users", "paginated", params] as const,
    byId: (id: number) => ["users", "byId", id] as const,
  },
  roleCatalog: {
    all: () => ["roleCatalog", "all"] as const,
  },
  departments: {
    all: () => ["departments", "all"] as const,
    paginated: (params: ListQueryParams) =>
      ["departments", "paginated", params] as const,
  },
  skills: {
    all: () => ["skills", "all"] as const,
    paginated: (params: ListQueryParams) =>
      ["skills", "paginated", params] as const,
  },
  locations: {
    all: () => ["locations", "all"] as const,
    paginated: (params: ListQueryParams) =>
      ["locations", "paginated", params] as const,
  },
  companyRoles: {
    all: () => ["companyRoles", "all"] as const,
    paginated: (params: ListQueryParams) =>
      ["companyRoles", "paginated", params] as const,
  },
  candidates: {
    cieList: (params: ListQueryParams) =>
      ["candidates", "cieList", params] as const,
    cieIds: (params: ListQueryParams) =>
      ["candidates", "cieIds", params] as const,
    list: (params: ListQueryParams) => ["candidates", "list", params] as const,
    byId: (id: number) => ["candidates", "byId", id] as const,
  },
  requisition: {
    detail: (reqId: number) => ["requisition", reqId, "detail"] as const,
    list: (params: ListQueryParams) =>
      ["requisition", "list", params] as const,
    myList: (params: ListQueryParams) =>
      ["requisition", "myList", params] as const,
    items: (reqId: number, params: ListQueryParams) =>
      ["requisition", reqId, "items", params] as const,
    statusHistory: (reqId: number, page: number) =>
      ["requisition", reqId, "statusHistory", page] as const,
    statusHistoryPaginated: (reqId: number, params: ListQueryParams) =>
      ["requisition", reqId, "statusHistoryPaginated", params] as const,
    auditLogs: (reqId: number, page: number) =>
      ["requisition", reqId, "auditLogs", page] as const,
    candidatesWorkspace: (
      reqId: number,
      params: ListQueryParams,
    ) => ["requisition", reqId, "candidatesWorkspace", params] as const,
  },
  applications: {
    byReq: (reqId: number) => ["applications", "byReq", reqId] as const,
    list: (params: ListQueryParams) =>
      ["applications", "list", params] as const,
    pipeline: (
      params: Record<string, string | number | boolean | null | undefined>,
    ) => ["applications", "pipeline", params] as const,
  },
  ranking: {
    item: (itemId: number) => ["ranking", "item", itemId] as const,
  },
  interviews: {
    byReq: (reqId: number) => ["interviews", "byReq", reqId] as const,
    list: (params: ListQueryParams) =>
      ["interviews", "list", params] as const,
    myList: (params: ListQueryParams) =>
      ["interviews", "myList", params] as const,
    managerList: (params: ListQueryParams) =>
      ["interviews", "managerList", params] as const,
  },
  auditLogs: {
    list: (params: ListQueryParams) =>
      ["auditLogs", "list", params] as const,
  },
  workflowAudit: {
    byReq: (reqId: number, params: ListQueryParams) =>
      ["workflowAudit", "byReq", reqId, params] as const,
    byItem: (itemId: number, params: ListQueryParams) =>
      ["workflowAudit", "byItem", itemId, params] as const,
    byUser: (userId: number, params: ListQueryParams) =>
      ["workflowAudit", "byUser", userId, params] as const,
  },
  notifications: {
    list: (params: ListQueryParams) =>
      ["notifications", "list", params] as const,
  },
  bulkImport: {
    list: (params: ListQueryParams) =>
      ["bulkImport", "list", params] as const,
  },
  jobs: {
    list: (params: ListQueryParams) => ["jobs", "list", params] as const,
  },
  admin: {
    users: (params: ListQueryParams) => ["admin", "users", params] as const,
    accessRequests: (params: ListQueryParams) =>
      ["admin", "accessRequests", params] as const,
  },
  hr: {
    employees: (params: ListQueryParams) =>
      ["hr", "employees", params] as const,
    skillsSummary: (params: ListQueryParams) =>
      ["hr", "skillsSummary", params] as const,
  },
  employees: {
    list: (params: ListQueryParams) =>
      ["employees", "list", params] as const,
  },
  referrals: {
    list: (params: ListQueryParams) =>
      ["referrals", "list", params] as const,
  },
  notes: {
    forCandidate: (candidateId: number, params: ListQueryParams) =>
      ["notes", "forCandidate", candidateId, params] as const,
  },
  reports: {
    pipelineStages: () => ["reports", "pipelineStages"] as const,
    pipelineFunnel: (params: ListQueryParams) =>
      ["reports", "pipelineFunnel", normalizeReportParams(params)] as const,
    interviewFunnel: (params: ListQueryParams) =>
      ["reports", "interviewFunnel", normalizeReportParams(params)] as const,
    timeToHire: (params: ListQueryParams) =>
      ["reports", "timeToHire", normalizeReportParams(params)] as const,
    sourceEffectiveness: (params: ListQueryParams) =>
      ["reports", "sourceEffectiveness", normalizeReportParams(params)] as const,
    recruiterPerformance: (params: ListQueryParams) =>
      ["reports", "recruiterPerformance", normalizeReportParams(params)] as const,
    interviewerPerformance: (params: ListQueryParams) =>
      ["reports", "interviewerPerformance", normalizeReportParams(params)] as const,
  },
} as const;

/**
 * Ensure the React Query cache key is stable for semantically equivalent
 * filter sets. Drops empty values, sorts keys alphabetically, and stringifies
 * everything so two callers passing `{ from: "", page: 1 }` and `{ page: "1" }`
 * land on the same cache entry.
 */
export function normalizeReportParams(params: ListQueryParams): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = Object.keys(params).sort();
  for (const key of keys) {
    const value = params[key];
    if (value == null) continue;
    const raw = String(value).trim();
    if (!raw) continue;
    out[key] = raw;
  }
  return out;
}
