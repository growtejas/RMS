"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { fetchRequisitionItemRanking } from "@/lib/api/candidateApi";
import type { RequisitionItemRankingResponse } from "@/lib/api/candidateApi";
import type {
  InterviewFunnelResponse,
  InterviewerPerformanceResponse,
  PipelineFunnelResponse,
  RecruiterPerformanceResponse,
  SourceEffectivenessResponse,
  TimeToHireResponse,
} from "@/lib/reports/types";

import { qk, STALE } from "./keys";

/**
 * Phase 3 - the canonical replacement for `getUsersListCached` (the
 * ad-hoc TTL cache + in-flight promise that lived in `users-list-cache`).
 * 10 min `staleTime` matches the rare-change budget for the directory
 * dropdown.
 */
export function useUsersList<T = Record<string, unknown>>() {
  return useQuery({
    queryKey: qk.users.list(),
    queryFn: async () => {
      const r = await apiClient.get<T[]>("/users");
      return r.data ?? [];
    },
    staleTime: STALE.veryRare,
    gcTime: STALE.veryRare * 2,
  });
}

/**
 * Per-requisition metadata. The detail endpoint is heavyweight (header +
 * items + nested) so we keep a 60 s staleTime to absorb tab switches
 * without triggering a refetch storm.
 */
export function useRequisitionDetail<T = unknown>(
  reqId: number | null,
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      reqId != null ? qk.requisition.detail(reqId) : ["requisition", "detail", null],
    queryFn: async () => {
      const r = await apiClient.get<T>(`/requisitions/${reqId}`);
      return r.data;
    },
    enabled: reqId != null && (opts?.enabled ?? true),
    staleTime: STALE.perRequisition,
  });
}

/**
 * Ranking snapshot. Focus refetch is explicitly off because the SSE
 * stream (`useAtsAiScoreStream`) keeps the cache fresh; refetching on
 * tab focus would otherwise duplicate work.
 */
export function useRequisitionItemRanking(
  itemId: number | null,
  opts?: { enabled?: boolean },
) {
  return useQuery<RequisitionItemRankingResponse>({
    queryKey: itemId != null ? qk.ranking.item(itemId) : ["ranking", "item", null],
    queryFn: () =>
      fetchRequisitionItemRanking(itemId as number, { aiEval: true }),
    enabled: itemId != null && (opts?.enabled ?? true),
    staleTime: STALE.ranking,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hover-prefetch helper for tab buttons. Wires into `onMouseEnter` so
 * the network round trip overlaps with the click animation.
 */
export function useHoverPrefetch() {
  const qc = useQueryClient();
  return {
    requisitionDetail: (reqId: number) =>
      qc.prefetchQuery({
        queryKey: qk.requisition.detail(reqId),
        queryFn: async () => {
          const r = await apiClient.get(`/requisitions/${reqId}`);
          return r.data;
        },
        staleTime: STALE.perRequisition,
      }),
    rankingItem: (itemId: number) =>
      qc.prefetchQuery({
        queryKey: qk.ranking.item(itemId),
        queryFn: () => fetchRequisitionItemRanking(itemId, { aiEval: true }),
        staleTime: STALE.ranking,
      }),
    auditLogs: (reqId: number) =>
      qc.prefetchQuery({
        queryKey: qk.requisition.auditLogs(reqId, 1),
        queryFn: async () => {
          const r = await apiClient.get(
            `/audit-logs?entity_name=requisition&entity_id=${reqId}`,
          );
          return r.data;
        },
        staleTime: STALE.list,
      }),
  };
}

type ReportQueryParams = Record<string, string | number | boolean | null | undefined>;

type StagesResponse = {
  stages: Array<{
    key: string;
    label: string;
    sortOrder: number;
    isTerminal: boolean;
    isHidden: boolean;
    stageType: "active" | "rejected" | "withdrawn" | "terminal";
  }>;
};

function toSearchParams(params: ReportQueryParams): string {
  const sp = new URLSearchParams();
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    const value = params[key];
    if (value == null) continue;
    const raw = String(value).trim();
    if (!raw) continue;
    sp.set(key, raw);
  }
  return sp.toString();
}

/**
 * Generic analytics report hook factory.
 *
 * Removes the seven hand-rolled hooks that all shared the same fetch +
 * envelope-unwrap shape. New report endpoints only need to register a new
 * key path + URL.
 */
function createReportHookFactory<T>(
  endpoint: string,
  keyFn: (params: ReportQueryParams) => readonly unknown[],
) {
  return function useReportQuery(
    params: ReportQueryParams,
    opts?: { enabled?: boolean; staleTime?: number },
  ) {
    return useQuery<T>({
      queryKey: keyFn(params),
      queryFn: async () => {
        const qs = toSearchParams(params);
        const r = await apiClient.get<{ data: T }>(`${endpoint}${qs ? `?${qs}` : ""}`);
        return r.data.data;
      },
      enabled: opts?.enabled ?? true,
      staleTime: opts?.staleTime ?? STALE.list,
    });
  };
}

export const useReportPipelineFunnel = createReportHookFactory<PipelineFunnelResponse>(
  "/reports/pipeline-funnel",
  qk.reports.pipelineFunnel,
);

export const useReportInterviewFunnel = createReportHookFactory<InterviewFunnelResponse>(
  "/reports/interview-funnel",
  qk.reports.interviewFunnel,
);

export const useReportTimeToHire = createReportHookFactory<TimeToHireResponse>(
  "/reports/time-to-hire",
  qk.reports.timeToHire,
);

export const useReportSourceEffectiveness = createReportHookFactory<SourceEffectivenessResponse>(
  "/reports/source-effectiveness",
  qk.reports.sourceEffectiveness,
);

export const useReportRecruiterPerformance = createReportHookFactory<RecruiterPerformanceResponse>(
  "/reports/recruiter-performance",
  qk.reports.recruiterPerformance,
);

export const useReportInterviewerPerformance =
  createReportHookFactory<InterviewerPerformanceResponse>(
    "/reports/interviewer-performance",
    qk.reports.interviewerPerformance,
  );

export function useReportPipelineStages(opts?: { enabled?: boolean }) {
  return useQuery<StagesResponse>({
    queryKey: qk.reports.pipelineStages(),
    queryFn: async () => {
      const r = await apiClient.get<{ data: StagesResponse }>("/reports/pipeline-stages");
      return r.data.data;
    },
    enabled: opts?.enabled ?? true,
    staleTime: STALE.veryRare,
  });
}
