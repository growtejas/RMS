import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  auditLog,
  employees,
  requisitionItems,
  requisitions,
  users,
} from "@/lib/db/schema";
import { TtlCache } from "@/lib/cache/ttl";

const OPEN_STATUSES = [
  "Pending_Budget",
  "Pending_HR",
  "Pending Budget Approval",
  "Pending HR Approval",
] as const;

const IN_PROGRESS_STATUSES = ["Active", "Approved & Unassigned"] as const;

const CLOSED_STATUSES = ["Fulfilled", "Closed"] as const;

const HR_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "REJECT",
  "HR_APPROVE",
  "HR_REJECT",
  "ASSIGN",
  "ONBOARD",
  "STATUS_CHANGE",
] as const;

const hrMetricsCache = new TtlCache<string, unknown>();

export async function getEmployeeCountsByStatus(): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      status: employees.empStatus,
      c: count(),
    })
    .from(employees)
    .groupBy(employees.empStatus);
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.status) {
      out[r.status] = Number(r.c);
    }
  }
  return out;
}

export async function getBenchEmployeeCount(): Promise<number> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT COUNT(DISTINCT ea.emp_id)::int AS c
    FROM employee_availability ea
    INNER JOIN (
      SELECT emp_id, MAX(effective_from) AS max_date
      FROM employee_availability
      WHERE effective_from <= CURRENT_DATE
      GROUP BY emp_id
    ) latest ON latest.emp_id = ea.emp_id AND latest.max_date = ea.effective_from
    INNER JOIN employees e ON e.emp_id = ea.emp_id
    WHERE e.emp_status = 'Active'
      AND ea.availability_pct = 100
  `);
  const row = Array.from(rows as Iterable<{ c: number }>)[0];
  return Number(row?.c ?? 0);
}

export async function getPendingHrApprovalCount(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(requisitions)
    .where(eq(requisitions.overallStatus, "Pending_HR"));
  return Number(row?.c ?? 0);
}

export async function getUpcomingProbationCount(days: number): Promise<number> {
  const today = new Date();
  const cutoffStart = new Date(today);
  cutoffStart.setHours(0, 0, 0, 0);
  cutoffStart.setDate(cutoffStart.getDate() - 90);
  const cutoffEnd = new Date(cutoffStart);
  cutoffEnd.setDate(cutoffEnd.getDate() + days);

  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(employees)
    .where(
      and(
        eq(employees.empStatus, "Active"),
        isNotNull(employees.doj),
        gte(employees.doj, cutoffStart),
        lte(employees.doj, cutoffEnd),
      ),
    );
  return Number(row?.c ?? 0);
}

function numToFloat(v: unknown): number | null {
  if (v === null || v === undefined) {
    return null;
  }
  const n = typeof v === "string" ? Number.parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) {
    return null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getPendingApprovalsForHr(limit: number) {
  const db = getDb();
  const rows = await db
    .select({
      reqId: requisitions.reqId,
      projectName: requisitions.projectName,
      clientName: requisitions.clientName,
      username: users.username,
      priority: requisitions.priority,
      overallStatus: requisitions.overallStatus,
      budgetAmount: requisitions.budgetAmount,
      requiredByDate: requisitions.requiredByDate,
      createdAt: requisitions.createdAt,
    })
    .from(requisitions)
    .leftJoin(users, eq(requisitions.raisedBy, users.userId))
    .where(eq(requisitions.overallStatus, "Pending_HR"))
    .orderBy(desc(requisitions.reqId))
    .limit(limit);

  return rows.map((r) => ({
    req_id: r.reqId,
    project_name: r.projectName,
    client_name: r.clientName,
    requester_name: r.username ?? "Unknown",
    priority: r.priority,
    overall_status: r.overallStatus,
    budget_amount: numToFloat(r.budgetAmount),
    required_by_date: isoDate(r.requiredByDate ?? undefined),
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : "",
  }));
}

export async function getHrPendingApprovalsList() {
  const db = getDb();
  const rows = await db
    .select({
      reqId: requisitions.reqId,
      projectName: requisitions.projectName,
      username: users.username,
      budgetAmount: requisitions.budgetAmount,
      overallStatus: requisitions.overallStatus,
      createdAt: requisitions.createdAt,
    })
    .from(requisitions)
    .leftJoin(users, eq(requisitions.raisedBy, users.userId))
    .where(eq(requisitions.overallStatus, "Pending_HR"))
    .orderBy(desc(requisitions.reqId));

  return rows.map((r) => ({
    requisition_id: String(r.reqId),
    project_name: r.projectName,
    manager_name: r.username,
    requested_date: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    budget_amount: numToFloat(r.budgetAmount),
    status: r.overallStatus,
  }));
}

export async function getRecentHrActivity(limit: number) {
  const db = getDb();
  const rows = await db
    .select({
      auditId: auditLog.auditId,
      action: auditLog.action,
      entityName: auditLog.entityName,
      entityId: auditLog.entityId,
      performedAt: auditLog.performedAt,
      username: users.username,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.performedBy, users.userId))
    .where(
      and(
        or(
          sql`lower(${auditLog.entityName}) IN ('employee', 'employees', 'requisition', 'requisitions', 'onboarding')`,
          inArray(auditLog.action, [...HR_ACTIONS]),
        ),
        notInArray(auditLog.action, ["OVERVIEW_VIEW", "USER_VIEW"] as string[]),
        sql`(length(${auditLog.action}) < 5 OR right(${auditLog.action}, 5) <> '_VIEW')`,
      ),
    )
    .orderBy(desc(auditLog.performedAt))
    .limit(limit);

  return rows.map((r) => ({
    audit_id: r.auditId,
    action: r.action,
    entity_name: r.entityName,
    entity_id: r.entityId,
    performed_at: r.performedAt ? new Date(r.performedAt).toISOString() : "",
    performed_by_name: r.username ?? null,
  }));
}

/** All requisitions in the org (every manager sees the same rollup on the dashboard). */
export async function getOrganizationRequisitionStatusCounts(
  organizationId: string,
): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      st: requisitions.overallStatus,
      c: count(),
    })
    .from(requisitions)
    .where(eq(requisitions.organizationId, organizationId))
    .groupBy(requisitions.overallStatus);
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.st) {
      out[r.st] = Number(r.c);
    }
  }
  return out;
}

export async function getOrganizationPendingPositionsCount(
  organizationId: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(requisitionItems)
    .innerJoin(requisitions, eq(requisitionItems.reqId, requisitions.reqId))
    .where(
      and(
        eq(requisitions.organizationId, organizationId),
        notInArray(requisitionItems.itemStatus, ["Fulfilled", "Cancelled"]),
      ),
    );
  return Number(row?.c ?? 0);
}

export async function getOrganizationPendingPositionsAlerts(
  organizationId: string,
  limit: number,
) {
  const db = getDb();
  const rows = await db
    .select({
      reqId: requisitions.reqId,
      pendingCount: count(requisitionItems.itemId),
    })
    .from(requisitionItems)
    .innerJoin(requisitions, eq(requisitionItems.reqId, requisitions.reqId))
    .where(
      and(
        eq(requisitions.organizationId, organizationId),
        notInArray(requisitionItems.itemStatus, ["Fulfilled", "Cancelled"]),
      ),
    )
    .groupBy(requisitions.reqId)
    .orderBy(desc(sql`count(${requisitionItems.itemId})`))
    .limit(limit);

  return rows.map((r) => ({
    requisition_id: String(r.reqId),
    pending_count: Number(r.pendingCount),
  }));
}

export async function getOrganizationSlaRisks(
  organizationId: string,
  slaDays: number,
  limit: number,
) {
  const db = getDb();
  const rows = await db
    .select({
      reqId: requisitions.reqId,
      createdAt: requisitions.createdAt,
    })
    .from(requisitions)
    .where(
      and(
        eq(requisitions.organizationId, organizationId),
        notInArray(requisitions.overallStatus, [
          "Closed",
          "Rejected",
          "Fulfilled",
          "Cancelled",
        ]),
      ),
    );

  const now = Date.now();
  const risks: { requisition_id: string; days_open: number }[] = [];
  for (const r of rows) {
    if (!r.createdAt) {
      continue;
    }
    const created = new Date(r.createdAt).getTime();
    const daysOpen = Math.floor((now - created) / 86_400_000);
    if (daysOpen >= slaDays) {
      risks.push({ requisition_id: String(r.reqId), days_open: daysOpen });
    }
  }
  risks.sort((a, b) => b.days_open - a.days_open);
  return risks.slice(0, limit);
}

export async function getOrganizationAvgFulfillmentDays(
  organizationId: string,
): Promise<number> {
  const db = getDb();
  const rows = await db.execute(sql`
    WITH closed AS (
      SELECT req_id, MIN(changed_at) AS closed_at
      FROM requisition_status_history
      WHERE new_status IN ('Fulfilled', 'Closed')
      GROUP BY req_id
    )
    SELECT r.created_at, c.closed_at
    FROM requisitions r
    INNER JOIN closed c ON c.req_id = r.req_id
    WHERE r.organization_id = ${organizationId}
  `);

  const durations: number[] = [];
  for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
    const ca = r.created_at;
    const cb = r.closed_at;
    if (ca && cb) {
      const a = new Date(String(ca)).getTime();
      const b = new Date(String(cb)).getTime();
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        durations.push(Math.floor((b - a) / 86_400_000));
      }
    }
  }
  if (durations.length === 0) {
    return 0;
  }
  return (
    Math.round((durations.reduce((s, x) => s + x, 0) / durations.length) * 100) /
    100
  );
}

export async function buildHrMetricsBundle() {
  const cached = hrMetricsCache.get("hr_metrics_v1");
  if (cached) {
    return cached as {
      metrics: unknown;
      pending_approvals: unknown;
      recent_activity: unknown;
    };
  }

  const [
    statusCounts,
    bench,
    pendingHr,
    probation,
    pending_approvals,
    recent_activity,
  ] = await Promise.all([
    getEmployeeCountsByStatus(),
    getBenchEmployeeCount(),
    getPendingHrApprovalCount(),
    getUpcomingProbationCount(30),
    getPendingApprovalsForHr(10),
    getRecentHrActivity(5),
  ]);
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  const metrics = {
    total_employees: total,
    active_employees: statusCounts["Active"] ?? 0,
    onboarding_employees: statusCounts["Onboarding"] ?? 0,
    on_leave_employees: statusCounts["On Leave"] ?? 0,
    exited_employees: statusCounts["Exited"] ?? 0,
    bench_employees: bench,
    pending_hr_approvals: pendingHr,
    upcoming_probation_count: probation,
  };

  const out = { metrics, pending_approvals, recent_activity };
  // Keep small (dashboards can refresh often); per-instance cache only.
  hrMetricsCache.set("hr_metrics_v1", out, 15_000);
  return out;
}

/** Organization-wide rollup for all managers with access to `/manager` dashboard. */
export async function buildManagerMetricsBundle(
  organizationId: string,
  slaDays: number,
) {
  const statusCounts = await getOrganizationRequisitionStatusCounts(organizationId);
  const totalRequisitions = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const open = OPEN_STATUSES.reduce(
    (s, st) => s + (statusCounts[st] ?? 0),
    0,
  );
  const inProgress = IN_PROGRESS_STATUSES.reduce(
    (s, st) => s + (statusCounts[st] ?? 0),
    0,
  );
  const closed = CLOSED_STATUSES.reduce(
    (s, st) => s + (statusCounts[st] ?? 0),
    0,
  );

  const pendingPositions =
    await getOrganizationPendingPositionsCount(organizationId);
  const avgFulfillment = await getOrganizationAvgFulfillmentDays(organizationId);
  const slaRisks = await getOrganizationSlaRisks(organizationId, slaDays, 10);
  const pendingAlerts = await getOrganizationPendingPositionsAlerts(
    organizationId,
    10,
  );

  return {
    total_requisitions: totalRequisitions,
    open,
    in_progress: inProgress,
    closed,
    pending_positions: pendingPositions,
    avg_fulfillment_days: avgFulfillment,
    sla_risks: slaRisks,
    pending_positions_alerts: pendingAlerts,
  };
}
