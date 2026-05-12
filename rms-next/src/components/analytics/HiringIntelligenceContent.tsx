"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer } from "recharts";

import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { CandidateFunnel } from "@/components/analytics/CandidateFunnel";
import { StageDrilldownDrawer } from "@/components/analytics/StageDrilldownDrawer";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import { ListFooter } from "@/components/ui/ListFooter";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  ANALYTICS_ARRAY_FILTER_KEYS,
  useAnalyticsFilters,
  type AnalyticsArrayFilterKey,
} from "@/lib/analytics/use-analytics-filters";
import {
  useReportPipelineFunnel,
  useReportPipelineStages,
  useReportRecruiterPerformance,
  useReportSourceEffectiveness,
} from "@/lib/query/hooks";
import { apiClient } from "@/lib/api/client";
import {
  buildPaginationMeta,
  DEFAULT_PAGE_SIZE,
  isPageSize,
  type PageSize,
} from "@/lib/pagination/contract";

/** Recruiter table pagination — keeps main `page`/`limit` for pipeline funnel + drilldown API. */
const HI_REC_PAGE = "hireRp";
const HI_REC_LIMIT = "hireRl";
/** Legacy source list pagination (removed from UI); strip from URL on filter change */
const LEGACY_HI_SRC_PAGE = "hireSp";
const LEGACY_HI_SRC_LIMIT = "hireSl";

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type AnalyticsSection =
  | "header"
  | "filters"
  | "kpis"
  | "candidateFunnel"
  | "sources"
  | "tables";

export const ALL_ANALYTICS_SECTIONS: AnalyticsSection[] = [
  "header",
  "filters",
  "kpis",
  "candidateFunnel",
  "sources",
  "tables",
];

export interface HiringIntelligenceContentProps {
  /** Optional scope binding. When provided, the relevant array filter is forced. */
  scope?: {
    kind: "organization" | "requisition" | "recruiter" | "department" | "source";
    requisitionId?: number;
    recruiterId?: number;
    department?: string;
    source?: string;
  };
  /** Title rendered in the report sticky header. */
  title?: string;
  /** Optional subtitle rendered under the title. */
  subtitle?: string;
  /** Restrict which sections render. Defaults to all sections. */
  sections?: AnalyticsSection[];
}

function applyScopeOverrides(
  baseParams: Record<string, string>,
  scope: HiringIntelligenceContentProps["scope"],
): Record<string, string> {
  if (!scope || scope.kind === "organization") return baseParams;
  const next = { ...baseParams };
  if (scope.kind === "requisition" && scope.requisitionId != null) {
    next.requisitionIds = String(scope.requisitionId);
  }
  if (scope.kind === "recruiter" && scope.recruiterId != null) {
    next.recruiterIds = String(scope.recruiterId);
  }
  if (scope.kind === "department" && scope.department) {
    next.department = scope.department;
  }
  if (scope.kind === "source" && scope.source) {
    next.source = scope.source;
  }
  return next;
}

export function HiringIntelligenceContent(props: HiringIntelligenceContentProps) {
  const filters = useAnalyticsFilters();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedStageKey = searchParams.get("stage") || null;

  const setSelectedStageKey = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set("stage", next);
        params.set("page", "1");
      } else {
        params.delete("stage");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const hireRecLimitRaw = parsePositiveInt(searchParams.get(HI_REC_LIMIT), DEFAULT_PAGE_SIZE);
  const hireRecLimit: PageSize = isPageSize(hireRecLimitRaw) ? hireRecLimitRaw : DEFAULT_PAGE_SIZE;
  const hireRecPageRequested = parsePositiveInt(searchParams.get(HI_REC_PAGE), 1);

  useEffect(() => {
    if (!searchParams.has(LEGACY_HI_SRC_PAGE) && !searchParams.has(LEGACY_HI_SRC_LIMIT)) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete(LEGACY_HI_SRC_PAGE);
    next.delete(LEGACY_HI_SRC_LIMIT);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const patchRecruiterTableParams = useCallback(
    (patch: Partial<{ recPage: number; recLimit: PageSize }>) => {
      const next = new URLSearchParams(searchParams.toString());
      if (patch.recPage != null) next.set(HI_REC_PAGE, String(patch.recPage));
      if (patch.recLimit != null) {
        next.set(HI_REC_LIMIT, String(patch.recLimit));
        next.set(HI_REC_PAGE, "1");
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const visibleSections = useMemo(() => new Set(props.sections ?? ALL_ANALYTICS_SECTIONS), [props.sections]);
  const has = (section: AnalyticsSection) => visibleSections.has(section);

  const baseParams = filters.toQueryParams();
  const scopedParams = useMemo(
    () => applyScopeOverrides(baseParams, props.scope),
    [baseParams, props.scope],
  );

  const hireListScopeFingerprint = useMemo(() => {
    const p = { ...scopedParams };
    delete p.page;
    delete p.limit;
    return JSON.stringify(p);
  }, [scopedParams]);

  const stagesQuery = useReportPipelineStages();
  const pipelineQuery = useReportPipelineFunnel({
    ...scopedParams,
    ...(selectedStageKey ? { stage: selectedStageKey } : {}),
  });
  const sourceQuery = useReportSourceEffectiveness(scopedParams);
  const recruiterQuery = useReportRecruiterPerformance(scopedParams);
  const requisitionsQuery = useQuery({
    queryKey: ["analytics", "filter-options", "requisitions"],
    queryFn: async () => {
      const r = await apiClient.get<{
        data?: { items?: Array<{ req_id?: number; project_name?: string | null }> };
      }>("/requisitions?page=1&limit=100");
      const items = r.data?.data?.items ?? [];
      return items
        .filter((row) => Number.isFinite(row.req_id))
        .map((row) => ({
          reqId: Number(row.req_id),
          projectName: row.project_name ?? null,
        }));
    },
    staleTime: 60_000,
  });

  const stageRows = useMemo(() => pipelineQuery.data?.stages ?? [], [pipelineQuery.data?.stages]);
  const kpis = pipelineQuery.data?.kpis;
  const recruiterRows = useMemo(
    () => recruiterQuery.data?.rows ?? [],
    [recruiterQuery.data?.rows],
  );
  const sourceRows = sourceQuery.data?.rows ?? [];

  const recruiterPagination = buildPaginationMeta({
    page: hireRecPageRequested,
    limit: hireRecLimit,
    total: recruiterRows.length,
  });

  const pagedRecruiterRows = useMemo(() => {
    if (recruiterRows.length === 0) return [];
    const start = (recruiterPagination.page - 1) * recruiterPagination.limit;
    return recruiterRows.slice(start, start + recruiterPagination.limit);
  }, [recruiterRows, recruiterPagination.page, recruiterPagination.limit]);

  const selectedStage = stageRows.find((s) => s.key === selectedStageKey) ?? null;
  const freshness = pipelineQuery.data?.freshness;
  const dropdownOptions = useMemo(() => {
    const requisitionOpts = (requisitionsQuery.data ?? []).map((r) => ({
      value: String(r.reqId),
      label: r.projectName?.trim()
        ? `REQ-${r.reqId} (${r.projectName.trim()})`
        : `REQ-${r.reqId}`,
    }));
    const sourceOpts = (sourceQuery.data?.rows ?? [])
      .map((row) => row.source?.trim())
      .filter((v): v is string => Boolean(v))
      .map((v) => ({ value: v, label: v }));
    const pipelineStageOpts = (stagesQuery.data?.stages ?? []).map((s) => ({
      value: s.label,
      label: s.label,
    }));
    const recruiterOpts = (recruiterQuery.data?.rows ?? [])
      .filter((row) => row.recruiterId != null)
      .map((row) => ({ value: String(row.recruiterId), label: row.recruiter }));
    const locationOpts = (filters.state.arrays.location ?? [])
      .filter((v) => v.trim().length > 0)
      .map((v) => ({ value: v, label: v }));
    const employmentOpts = ["Remote", "Hybrid", "Onsite", "Contract", "Full-time", "Part-time"].map((v) => ({
      value: v,
      label: v,
    }));

    return {
      requisitionIds: Array.from(new Map(requisitionOpts.map((o) => [o.value, o])).values()),
      source: Array.from(new Map(sourceOpts.map((o) => [o.value, o])).values()),
      pipelineStages: Array.from(new Map(pipelineStageOpts.map((o) => [o.value, o])).values()),
      recruiterIds: Array.from(new Map(recruiterOpts.map((o) => [o.value, o])).values()),
      location: Array.from(new Map(locationOpts.map((o) => [o.value, o])).values()),
      employmentType: employmentOpts,
    };
  }, [
    filters.state.arrays.location,
    requisitionsQuery.data,
    recruiterQuery.data?.rows,
    sourceQuery.data?.rows,
    stagesQuery.data?.stages,
  ]);

  const handleArrayInput = (key: AnalyticsArrayFilterKey, csv: string) => {
    if (key === "requisitionIds") {
      for (const otherKey of ANALYTICS_ARRAY_FILTER_KEYS) {
        if (otherKey !== "requisitionIds" && filters.state.arrays[otherKey].length > 0) {
          filters.setArrayFilter(otherKey, []);
        }
      }
      filters.setSearch("");
      filters.setRangeStart("");
      filters.setRangeEnd("");
      filters.setPage(1);
      filters.setLimit(25);
    }
    const values = csv
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    filters.setArrayFilter(key, values);
  };

  const handlePipelinePageChange = (page: number) => filters.setPage(page);

  const handleResetRequisitionOnly = () => {
    for (const key of ANALYTICS_ARRAY_FILTER_KEYS) {
      filters.setArrayFilter(key, []);
    }
    filters.setSearch("");
    filters.setRangeStart("");
    filters.setRangeEnd("");
    filters.setPage(1);
    filters.setLimit(25);
  };

  /** Sync URL when recruiter table page exceeds range after row count changes */
  useEffect(() => {
    if (recruiterPagination.page === hireRecPageRequested) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set(HI_REC_PAGE, String(recruiterPagination.page));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [hireRecPageRequested, pathname, recruiterPagination.page, router, searchParams]);

  const prevHireScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevHireScopeRef.current === null) {
      prevHireScopeRef.current = hireListScopeFingerprint;
      return;
    }
    if (prevHireScopeRef.current === hireListScopeFingerprint) return;
    prevHireScopeRef.current = hireListScopeFingerprint;
    const next = new URLSearchParams(searchParams.toString());
    next.set(HI_REC_PAGE, "1");
    next.delete(LEGACY_HI_SRC_PAGE);
    next.delete(LEGACY_HI_SRC_LIMIT);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [hireListScopeFingerprint, pathname, router, searchParams]);

  return (
    <div className="space-y-6 pb-12">
      {has("header") ? (
        <header className="sticky top-0 z-20 rounded-2xl border border-border bg-surface/95 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-text">{props.title ?? "Hiring Intelligence"}</h1>
            <p className="text-sm text-text-muted">
              {props.subtitle ??
                "Enterprise hiring analytics across candidate and interview lifecycles."}
            </p>
            {freshness ? (
              <p className="text-[11px] text-text-muted">
                Data as of {new Date(freshness.generatedAt).toLocaleString()} · server compute{" "}
                {freshness.computeMs}ms · source: {freshness.source}
              </p>
            ) : null}
          </div>
        </header>
      ) : null}

      {has("filters") ? (
        <AnalyticsFilterBar
          searchInput={filters.searchInput}
          fromDate={filters.state.from}
          toDate={filters.state.to}
          pageLimit={filters.state.limit}
          arrays={filters.state.arrays}
          activeBadges={filters.activeBadges}
          onSearchChange={filters.setSearch}
          onRangeStart={filters.setRangeStart}
          onRangeEnd={filters.setRangeEnd}
          onLimitChange={filters.setLimit}
          onArrayInput={handleArrayInput}
          onResetAll={handleResetRequisitionOnly}
          dropdownOptions={dropdownOptions}
          requisitionOnly
        />
      ) : null}

      {has("kpis") ? (
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {pipelineQuery.isLoading || !kpis ? (
          <ListSkeleton variant="cards" rows={8} rowHeight={120} />
        ) : (
          [
            ["Total Applications", kpis.totalApplications, kpis.sparkline?.applications],
            ["Total Interviews", kpis.totalInterviews, kpis.sparkline?.applications],
            ["Hires", kpis.hires, kpis.sparkline?.hires],
            ["Offer Acceptance %", `${kpis.offerAcceptanceRate}%`, kpis.sparkline?.hires],
            ["Active Jobs", kpis.activeJobs, kpis.sparkline?.applications],
          ].map(([label, value, series]) => (
            <Card key={String(label)}>
              <CardHeader className="pb-2">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  {String(label)}
                </p>
                <p className="text-2xl font-bold text-text">{value as never}</p>
              </CardHeader>
              <CardBody className="pt-0">
                <div className="h-12">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={(series ?? []) as never}>
                      <Line dataKey="value" stroke="#4f46e5" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </section>
      ) : null}

      {has("candidateFunnel") || has("sources") ? (
      <section className="grid gap-5 lg:grid-cols-2">
        {has("candidateFunnel") ? (
          <CandidateFunnel
            rows={stageRows}
            isLoading={pipelineQuery.isLoading || stagesQuery.isLoading}
            isError={pipelineQuery.isError}
            onRetry={() => pipelineQuery.refetch()}
            onSelectStage={(key) => setSelectedStageKey(key)}
            selectedStageKey={selectedStageKey}
          />
        ) : null}
        {has("sources") ? (
        <Card>
          <CardHeader>
            <CardTitle>Source Effectiveness</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {sourceQuery.isLoading ? (
              <ListSkeleton rows={4} rowHeight={48} />
            ) : sourceRows.length === 0 ? (
              <ListEmpty description="No source data for current filters." />
            ) : (
              sourceRows.map((row) => (
                <div key={row.source} className="rounded-lg border border-border p-2 text-xs">
                  <p className="font-semibold">{row.source}</p>
                  <p className="text-text-muted">
                    Apps {row.applications} · Interviews {row.interviews} · Hires {row.hires} · Conv{" "}
                    {row.conversionPct}% · Quality {row.qualityScore}
                  </p>
                </div>
              ))
            )}
          </CardBody>
        </Card>
        ) : null}
      </section>
      ) : null}

      <StageDrilldownDrawer
        open={selectedStageKey != null}
        stageLabel={selectedStage?.stage ?? null}
        isFetching={pipelineQuery.isFetching}
        rows={pipelineQuery.data?.drillDownRows ?? []}
        pagination={pipelineQuery.data?.pagination ?? null}
        onClose={() => setSelectedStageKey(null)}
        onPageChange={handlePipelinePageChange}
      />

      {has("tables") ? (
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Detailed Performance Tables</CardTitle>
          </CardHeader>
          <CardBody>
            {recruiterQuery.isLoading ? (
              <ListSkeleton rows={6} rowHeight={40} />
            ) : recruiterRows.length === 0 ? (
              <ListEmpty description="No recruiter data for current filters." />
            ) : (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Recruiter</TH>
                      <TH>Candidates Processed</TH>
                      <TH>Hires</TH>
                      <TH>Conversion %</TH>
                      <TH>Avg Response Hours</TH>
                      <TH>Active Reqs</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pagedRecruiterRows.map((row) => (
                      <TR key={`${row.recruiter}-${row.recruiterId ?? "deleted"}`} hover>
                        <TD>{row.recruiter}</TD>
                        <TD>{row.candidatesProcessed}</TD>
                        <TD>{row.hiresMade}</TD>
                        <TD>{row.conversionPct}%</TD>
                        <TD>{row.avgResponseHours}h</TD>
                        <TD>{row.activeRequisitions}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <ListFooter
                  pagination={recruiterPagination}
                  onPageChange={(p) => patchRecruiterTableParams({ recPage: p })}
                  onPageSizeChange={(lim) => patchRecruiterTableParams({ recLimit: lim })}
                />
              </>
            )}
          </CardBody>
        </Card>
      </section>
      ) : null}
      <span className="sr-only">{ANALYTICS_ARRAY_FILTER_KEYS.length} configured filter keys</span>
    </div>
  );
}
