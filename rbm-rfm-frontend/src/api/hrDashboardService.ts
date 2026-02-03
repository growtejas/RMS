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
   * Approve a requisition (convenience wrapper)
   */
  approveRequisition: async (reqId: number) => {
    const response = await apiClient.put(`/requisitions/${reqId}/status`, {
      overall_status: "Approved & Unassigned",
    });
    return response.data;
  },

  /**
   * Reject a requisition with reason
   */
  rejectRequisition: async (reqId: number, reason: string) => {
    const response = await apiClient.put(`/requisitions/${reqId}/reject`, {
      rejection_reason: reason,
    });
    return response.data;
  },
};

export default hrDashboardService;
