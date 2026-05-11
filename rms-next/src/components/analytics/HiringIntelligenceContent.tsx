"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { CandidateFunnel } from "@/components/analytics/CandidateFunnel";
import { StageDrilldownDrawer } from "@/components/analytics/StageDrilldownDrawer";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ListEmpty } from "@/components/ui/ListEmpty";
import { ListError } from "@/components/ui/ListError";
import { ListSkeleton } from "@/components/ui/ListSkeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  ANALYTICS_ARRAY_FILTER_KEYS,
  useAnalyticsFilters,
  type AnalyticsArrayFilterKey,
} from "@/lib/analytics/use-analytics-filters";
import {
  useReportInterviewerPerformance,
  useReportInterviewFunnel,
  useReportPipelineFunnel,
  useReportPipelineStages,
  useReportRecruiterPerformance,
  useReportSourceEffectiveness,
  useReportTimeToHire,
} from "@/lib/query/hooks";
import { apiClient } from "@/lib/api/client";

export type AnalyticsSection =
  | "header"
  | "filters"
  | "kpis"
  | "candidateFunnel"
  | "aiInsights"
  | "interviewFunnel"
  | "timeToHire"
  | "sources"
  | "recruiters"
  | "interviewers"
  | "tables";

export const ALL_ANALYTICS_SECTIONS: AnalyticsSection[] = [
  "header",
  "filters",
  "kpis",
  "candidateFunnel",
  "aiInsights",
  "interviewFunnel",
  "timeToHire",
  "sources",
  "recruiters",
  "interviewers",
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

  const visibleSections = useMemo(() => new Set(props.sections ?? ALL_ANALYTICS_SECTIONS), [props.sections]);
  const has = (section: AnalyticsSection) => visibleSections.has(section);

  const baseParams = filters.toQueryParams();
  const scopedParams = useMemo(
    () => applyScopeOverrides(baseParams, props.scope),
    [baseParams, props.scope],
  );

  const stagesQuery = useReportPipelineStages();
  const pipelineQuery = useReportPipelineFunnel({
    ...scopedParams,
    ...(selectedStageKey ? { stage: selectedStageKey } : {}),
  });
  const interviewQuery = useReportInterviewFunnel(scopedParams);
  const timeToHireQuery = useReportTimeToHire(scopedParams);
  const sourceQuery = useReportSourceEffectiveness(scopedParams);
  const recruiterQuery = useReportRecruiterPerformance(scopedParams);
  const interviewerQuery = useReportInterviewerPerformance(scopedParams);
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
  const selectedStage = stageRows.find((s) => s.key === selectedStageKey) ?? null;
  const freshness = pipelineQuery.data?.freshness;
  const dropdownOptions = useMemo(() => {
    const requisitionOpts = (requisitionsQuery.data ?? []).map((r) => ({
      value: String(r.reqId),
      label: r.projectName?.trim()
        ? `REQ-${r.reqId} (${r.projectName.trim()})`
        : `REQ-${r.reqId}`,
    }));
    const departmentOpts = (timeToHireQuery.data?.byDepartment ?? [])
      .map((d) => (d.department ?? "").trim())
      .filter((v) => v.length > 0)
      .map((v) => ({ value: v, label: v }));
    const sourceOpts = (sourceQuery.data?.rows ?? [])
      .map((row) => row.source?.trim())
      .filter((v): v is string => Boolean(v))
      .map((v) => ({ value: v, label: v }));
    const pipelineStageOpts = (stagesQuery.data?.stages ?? []).map((s) => ({
      value: s.label,
      label: s.label,
    }));
    const interviewStageOpts = (interviewQuery.data?.stages ?? []).map((s) => ({
      value: s.stage,
      label: s.stage,
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
      department: Array.from(new Map(departmentOpts.map((o) => [o.value, o])).values()),
      source: Array.from(new Map(sourceOpts.map((o) => [o.value, o])).values()),
      pipelineStages: Array.from(new Map(pipelineStageOpts.map((o) => [o.value, o])).values()),
      interviewStage: Array.from(new Map(interviewStageOpts.map((o) => [o.value, o])).values()),
      recruiterIds: Array.from(new Map(recruiterOpts.map((o) => [o.value, o])).values()),
      location: Array.from(new Map(locationOpts.map((o) => [o.value, o])).values()),
      employmentType: employmentOpts,
    };
  }, [
    filters.state.arrays.location,
    interviewQuery.data?.stages,
    requisitionsQuery.data,
    recruiterQuery.data?.rows,
    sourceQuery.data?.rows,
    stagesQuery.data?.stages,
    timeToHireQuery.data?.byDepartment,
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

  const handlePageChange = (page: number) => filters.setPage(page);
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

  const insights = useMemo(() => {
    const list: Array<{ label: string; severity: string; recommendation: string }> = [];
    if (stageRows.length > 1) {
      const sorted = [...stageRows].sort((a, b) => b.dropOffPct - a.dropOffPct);
      const worst = sorted[0];
      if (worst && worst.dropOffPct > 0) {
        list.push({
          label: `${worst.stage} has the highest drop-off (${worst.dropOffPct}%).`,
          severity: "high",
          recommendation: "Add structured rejection reasons and audit interviewer calibration.",
        });
      }
    }
    const topSource = sourceQuery.data?.rows?.[0];
    if (topSource) {
      list.push({
        label: `${topSource.source} delivers the strongest hire rate (${topSource.conversionPct}%).`,
        severity: "medium",
        recommendation: "Re-allocate sourcing budget toward this channel.",
      });
    }
    const slowestDept = timeToHireQuery.data?.byDepartment?.[0];
    if (slowestDept) {
      list.push({
        label: `${slowestDept.department} has the slowest fill cycle (${slowestDept.avgDays}d avg).`,
        severity: "medium",
        recommendation: "Run an intake calibration with hiring managers in this department.",
      });
    }
    if (list.length === 0) {
      list.push({
        label: "Insights will activate once enough hires and rejections accumulate.",
        severity: "low",
        recommendation: "Encourage recruiters to log structured stage transitions.",
      });
    }
    return list;
  }, [stageRows, sourceQuery.data, timeToHireQuery.data]);

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
            ["Avg Time To Hire", `${kpis.avgTimeToHireDays}d`, kpis.sparkline?.hires],
            ["Pipeline Conversion %", `${kpis.pipelineConversionPct}%`, kpis.sparkline?.hires],
            ["Interview No-Show %", `${kpis.interviewNoShowPct}%`, kpis.sparkline?.applications],
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

      {has("candidateFunnel") || has("aiInsights") ? (
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
        {has("aiInsights") ? (
          <Card>
            <CardHeader>
              <CardTitle>AI Hiring Insights</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {insights.map((insight) => (
                <div
                  key={insight.label}
                  className="rounded-xl border border-border bg-surface-2 p-4"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-semibold text-text">{insight.label}</p>
                    <span className="rounded-full bg-slate-900/5 px-2 py-1 text-xs font-medium uppercase text-text-muted">
                      {insight.severity}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">{insight.recommendation}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        ) : null}
      </section>
      ) : null}

      {has("interviewFunnel") || has("timeToHire") ? (
      <section className="grid gap-5 lg:grid-cols-2">
        {has("interviewFunnel") ? (
        <Card>
          <CardHeader>
            <CardTitle>Interview Lifecycle Funnel</CardTitle>
          </CardHeader>
          <CardBody>
            {interviewQuery.isError ? (
              <ListError onRetry={() => interviewQuery.refetch()} />
            ) : interviewQuery.isLoading ? (
              <ListSkeleton rows={5} rowHeight={42} />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={interviewQuery.data?.stages ?? []}>
                    <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0891b2" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 space-y-2">
              {(interviewQuery.data?.bottlenecks ?? []).map((item) => (
                <div
                  key={item.stage}
                  className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
                >
                  {item.stage}: {item.warning} ({item.delayedCount} delayed)
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        ) : null}

        {has("timeToHire") ? (
        <Card>
          <CardHeader>
            <CardTitle>Time To Hire Trend</CardTitle>
          </CardHeader>
          <CardBody>
            {timeToHireQuery.isError ? (
              <ListError onRetry={() => timeToHireQuery.refetch()} />
            ) : timeToHireQuery.isLoading ? (
              <ListSkeleton rows={5} rowHeight={42} />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeToHireQuery.data?.trend ?? []}>
                    <XAxis dataKey="date" hide />
                    <YAxis />
                    <Tooltip />
                    <Line dataKey="avgDays" stroke="#7c3aed" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
        ) : null}
      </section>
      ) : null}

      {has("sources") || has("recruiters") || has("interviewers") ? (
      <section className="grid gap-5 xl:grid-cols-3">
        {has("sources") ? (
        <Card>
          <CardHeader>
            <CardTitle>Source Effectiveness</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {sourceQuery.isLoading ? (
              <ListSkeleton rows={4} rowHeight={48} />
            ) : (sourceQuery.data?.rows ?? []).length === 0 ? (
              <ListEmpty description="No source data for current filters." />
            ) : (
              (sourceQuery.data?.rows ?? []).map((row) => (
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
        {has("recruiters") ? (
        <Card>
          <CardHeader>
            <CardTitle>Recruiter Performance</CardTitle>
          </CardHeader>
          <CardBody>
            {recruiterQuery.isLoading ? (
              <ListSkeleton rows={4} rowHeight={48} />
            ) : (recruiterQuery.data?.rows ?? []).length === 0 ? (
              <ListEmpty description="No recruiter data for current filters." />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={recruiterQuery.data?.rows ?? []}>
                    <XAxis dataKey="recruiter" hide />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="conversionPct" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
        ) : null}
        {has("interviewers") ? (
        <Card>
          <CardHeader>
            <CardTitle>Interviewer Effectiveness</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {interviewerQuery.isLoading ? (
              <ListSkeleton rows={4} rowHeight={48} />
            ) : (interviewerQuery.data?.rows ?? []).slice(0, 8).length === 0 ? (
              <ListEmpty description="No interviewer data for current filters." />
            ) : (
              (interviewerQuery.data?.rows ?? []).slice(0, 8).map((row) => (
                <div
                  key={`${row.interviewer}-${row.interviewerId ?? "deleted"}`}
                  className="rounded-lg border border-border p-2 text-xs"
                >
                  <p className="font-semibold">{row.interviewer}</p>
                  <p className="text-text-muted">
                    Interviews {row.interviewsConducted} · Pass {row.passRatioPct}% · Feedback{" "}
                    {row.avgFeedbackSubmissionHours}h · Overdue {row.overdueFeedbackCount}
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
        onPageChange={handlePageChange}
      />

      {has("tables") ? (
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Detailed Performance Tables</CardTitle>
          </CardHeader>
          <CardBody>
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
                {(recruiterQuery.data?.rows ?? []).map((row) => (
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
          </CardBody>
        </Card>
      </section>
      ) : null}
      <span className="sr-only">{ANALYTICS_ARRAY_FILTER_KEYS.length} configured filter keys</span>
    </div>
  );
}
