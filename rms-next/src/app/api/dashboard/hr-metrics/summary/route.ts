import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import {
  getBenchEmployeeCount,
  getEmployeeCountsByStatus,
  getPendingHrApprovalCount,
  getUpcomingProbationCount,
} from "@/lib/repositories/dashboard-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/dashboard/hr-metrics/summary */
export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin");
    if (denied) {
      return denied;
    }

    const statusCounts = await getEmployeeCountsByStatus();
    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const metrics = {
      total_employees: total,
      active_employees: statusCounts["Active"] ?? 0,
      onboarding_employees: statusCounts["Onboarding"] ?? 0,
      on_leave_employees: statusCounts["On Leave"] ?? 0,
      exited_employees: statusCounts["Exited"] ?? 0,
      bench_employees: await getBenchEmployeeCount(),
      pending_hr_approvals: await getPendingHrApprovalCount(),
      upcoming_probation_count: await getUpcomingProbationCount(30),
    };
    return NextResponse.json(metrics);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/dashboard/hr-metrics/summary]");
  }
}
