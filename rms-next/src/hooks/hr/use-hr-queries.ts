"use client";

import { useQuery } from "@tanstack/react-query";

import { hrDashboardService } from "@/lib/api/hrDashboardService";
import type { HRDashboardData } from "@/lib/api/hrDashboardService";
import { cachedApiGet } from "@/lib/api/cached-api-get";
import {
  fetchHrEmployeeListRows,
  type HrEmployeeListRow,
} from "@/lib/hr/fetch-hr-employee-list-rows";
import { hrQueryKeys } from "@/lib/hr/query-keys";
import type { BackendRequisition } from "@/types/hr-requisition-backend";

interface SkillsSummaryRow {
  skill_id: number;
  skill_name: string;
  total_employees: number;
  proficiency: {
    junior: number;
    mid: number;
    senior: number;
  };
}

export function useHrDashboardQuery(enabled = true) {
  return useQuery<HRDashboardData>({
    queryKey: hrQueryKeys.dashboard,
    queryFn: ({ signal }) => hrDashboardService.getDashboardData(signal),
    enabled,
  });
}

export function useHrRequisitionsListQuery(enabled = true) {
  return useQuery<BackendRequisition[]>({
    queryKey: hrQueryKeys.requisitions,
    queryFn: ({ signal }) =>
      cachedApiGet<BackendRequisition[]>("/requisitions", {
        signal,
        cacheTtlMs: 20_000,
      }).then((d) => d ?? []),
    enabled,
  });
}

export function useHrEmployeesAggregateQuery(enabled = true) {
  return useQuery<HrEmployeeListRow[]>({
    queryKey: hrQueryKeys.employeesAggregate,
    queryFn: ({ signal }) => fetchHrEmployeeListRows(signal),
    enabled,
  });
}

export function useHrSkillsSummaryQuery(enabled = true) {
  return useQuery({
    queryKey: hrQueryKeys.skillsSummary,
    queryFn: ({ signal }) =>
      cachedApiGet<SkillsSummaryRow[]>("/hr/skills-summary", { signal }).then(
        (rows) =>
          (rows ?? []).map((row) => ({
            skillId: row.skill_id,
            skillName: row.skill_name,
            totalEmployees: row.total_employees,
            proficiency: row.proficiency,
          })),
      ),
    enabled,
  });
}
