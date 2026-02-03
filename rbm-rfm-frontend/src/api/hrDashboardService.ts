/**
 * HR Dashboard Service
 * API layer for HR dashboard data fetching
 */

import { apiClient } from "./client";

// ============================================
// Type Definitions
// ============================================

export interface HRMetrics {
  total_employees: number;
  active_employees: number;
  onboarding_employees: number;
  on_leave_employees: number;
  exited_employees: number;
  bench_employees: number;
  pending_hr_approvals: number;
  upcoming_probation_count: number;
}

export interface PendingApproval {
  req_id: number;
  project_name: string | null;
  client_name: string | null;
  requester_name: string;
  priority: string | null;
  overall_status: string;
  budget_amount: number | null;
  required_by_date: string | null;
  created_at: string;
}

export interface HRPendingApprovalItem {
  requisition_id: string;
  project_name: string | null;
  manager_name: string | null;
  requested_date: string | null;
  budget_amount: number | null;
  status: string;
}

export interface RecentActivity {
  audit_id: number;
  action: string;
  entity_name: string;
  entity_id: string | null;
  performed_at: string;
  performed_by_name: string | null;
}

export interface HRDashboardData {
  metrics: HRMetrics;
  pending_approvals: PendingApproval[];
  recent_activity: RecentActivity[];
}

// ============================================
// Service Functions
// ============================================

/**
 * Fetch complete HR dashboard data including metrics, pending approvals, and recent activity.
 * Requires HR or Admin role.
 */
export async function fetchHRDashboardData(
  signal?: AbortSignal,
): Promise<HRDashboardData> {
  const response = await apiClient.get<HRDashboardData>(
    "/dashboard/hr-metrics",
    { signal },
  );
  return response.data;
}

/**
 * Fetch only HR metrics summary (lightweight version).
 * Requires HR or Admin role.
 */
export async function fetchHRMetricsSummary(
  signal?: AbortSignal,
): Promise<HRMetrics> {
  const response = await apiClient.get<HRMetrics>(
    "/dashboard/hr-metrics/summary",
    { signal },
  );
  return response.data;
}

// ============================================
// Service Object Export (Alternative pattern)
// ============================================

export const hrDashboardService = {
  /**
   * Fetch complete HR dashboard data
   */
  getDashboardData: fetchHRDashboardData,

  /**
   * Fetch only metrics summary
   */
  getMetricsSummary: fetchHRMetricsSummary,

  /**
   * Fetch pending HR approvals (dedicated endpoint)
   */
  getPendingApprovals: async (signal?: AbortSignal) => {
    const response = await apiClient.get<HRPendingApprovalItem[]>(
      "/dashboard/hr/pending-approvals",
      { signal },
    );
    return response.data;
  },

  /**
   * Approve a requisition (convenience wrapper)
   */
  approveRequisition: async (reqId: number | string) => {
    const response = await apiClient.put(`/requisitions/${reqId}/approve`);
    return response.data;
  },

  /**
   * Reject a requisition with reason
   */
  rejectRequisition: async (reqId: number | string, reason: string) => {
    const response = await apiClient.put(`/requisitions/${reqId}/reject`, {
      reason,
    });
    return response.data;
  },
};

export default hrDashboardService;
