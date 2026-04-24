"use client";

import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";

export interface ManagerRequisition {
  req_id: number;
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

interface UseManagerRequisitionListResult {
  requisitions: ManagerRequisition[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export const useManagerRequisitionList = (): UseManagerRequisitionListResult => {
  const [requisitions, setRequisitions] = useState<ManagerRequisition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequisitions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response =
        await apiClient.get<ManagerRequisition[]>("/requisitions/my");
      const rows = (response.data ?? []).map((req) => {
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

        return {
          ...req,
          effective_budget: effectiveBudget,
        };
      });

      setRequisitions(rows);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load requisitions";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRequisitions();
  }, [fetchRequisitions]);

  return {
    requisitions,
    isLoading,
    error,
    reload: fetchRequisitions,
  };
};
