"use client";

import { useMemo } from "react";

import { apiClient } from "@/lib/api/client";
import {
  DEFAULT_PAGE_SIZE,
  type PageSize,
  type PaginatedData,
  type PaginatedEnvelope,
  type PaginationMeta,
} from "@/lib/pagination/contract";
import { usePaginatedList } from "@/lib/pagination/use-paginated-list";
import { qk } from "@/lib/query/keys";

export interface ManagerRequisition {
  req_id: number;
  /** Present on org-wide list; identifies who created the requisition. */
  raised_by?: number;
  project_name: string | null;
  client_name: string | null;
  overall_status: string;
  required_by_date: string | null;
  priority: string | null;
  budget_amount: number | null;
  created_at: string | null;
  items?: Array<{
    estimated_budget?: number | null;
    approved_budget?: number | null;
  }>;
  effective_budget?: number | null;
}

export type ManagerRequisitionListScope = "mine" | "org";

interface UseManagerRequisitionListOptions {
  page?: number;
  limit?: PageSize;
}

interface UseManagerRequisitionListResult {
  requisitions: ManagerRequisition[];
  pagination: PaginationMeta;
  isLoading: boolean;
  isPaging: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

function withEffectiveBudget(req: ManagerRequisition): ManagerRequisition {
  const itemEstimatedTotal = (req.items ?? []).reduce(
    (sum, item) => sum + (item.estimated_budget ?? 0),
    0,
  );
  const itemApprovedTotal = (req.items ?? []).reduce(
    (sum, item) => sum + (item.approved_budget ?? 0),
    0,
  );

  const headerBudget = req.budget_amount ?? 0;
  const fallbackBudget = Math.max(itemApprovedTotal, itemEstimatedTotal);
  const effectiveBudget =
    headerBudget > 0 ? headerBudget : fallbackBudget > 0 ? fallbackBudget : null;

  return { ...req, effective_budget: effectiveBudget };
}

export const useManagerRequisitionList = (
  scope: ManagerRequisitionListScope = "mine",
  opts: UseManagerRequisitionListOptions = {},
): UseManagerRequisitionListResult => {
  const page = opts.page ?? 1;
  const limit: PageSize = opts.limit ?? DEFAULT_PAGE_SIZE;

  const queryParams = useMemo(
    () => ({ scope, page, limit }),
    [scope, page, limit],
  );

  const list = usePaginatedList<ManagerRequisition>({
    queryKey:
      scope === "mine"
        ? qk.requisition.myList(queryParams)
        : qk.requisition.list(queryParams),
    fetcher: async ({ signal }) => {
      const endpoint = scope === "mine" ? "/requisitions/my" : "/requisitions";
      const params: Record<string, string | number> = { page, limit };
      const response = await apiClient.get<
        PaginatedEnvelope<ManagerRequisition>
      >(endpoint, { params, signal });
      const data: PaginatedData<ManagerRequisition> = response.data?.data ?? {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      return data;
    },
  });

  const requisitions = useMemo(
    () => list.items.map(withEffectiveBudget),
    [list.items],
  );

  return {
    requisitions,
    pagination: list.pagination,
    isLoading: list.isLoading,
    isPaging: list.isPaging,
    error: list.isError
      ? list.error instanceof Error
        ? list.error.message
        : "Failed to load requisitions"
      : null,
    reload: async () => {
      await list.refetch();
    },
  };
};
