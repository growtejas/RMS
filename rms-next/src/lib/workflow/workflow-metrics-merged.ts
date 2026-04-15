/**
 * Merges durable audit rows (successes) with in-process failure counters.
 * Avoids counting successes before a rolled-back transaction completes.
 */

import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { workflowTransitionAudit } from "@/lib/db/schema";
import { getWorkflowMetrics } from "@/lib/workflow/workflow-metrics-collector";

export function workflowTransitionMetricKey(
  entityType: string,
  fromStatus: string,
  toStatus: string,
  action: string,
): string {
  return `${entityType}:${fromStatus}:${toStatus}:${action}`;
}

export type MergedMetricsResponse = {
  total_transitions: number;
  total_successes: number;
  total_failures: number;
  total_conflicts: number;
  success_rate: number;
  avg_duration_ms: number;
  uptime_seconds: number;
  start_time: string;
  transitions: {
    entity_type: string;
    from_status: string;
    to_status: string;
    action: string;
    success_count: number;
    failure_count: number;
    avg_duration_ms: number;
    last_success: string | null;
    last_failure: string | null;
    last_error: string | null;
  }[];
  recent_errors: { timestamp: string; transition: string; error: string }[];
};

export async function getMergedWorkflowMetrics(): Promise<MergedMetricsResponse> {
  const db = getDb();
  const collectorData = getWorkflowMetrics();

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workflowTransitionAudit);
  const totalSuccesses = totalRow?.n ?? 0;

  const dbGroups = await db
    .select({
      entity_type: workflowTransitionAudit.entityType,
      from_status: workflowTransitionAudit.fromStatus,
      to_status: workflowTransitionAudit.toStatus,
      action: workflowTransitionAudit.action,
      success_count: sql<number>`count(*)::int`,
    })
    .from(workflowTransitionAudit)
    .groupBy(
      workflowTransitionAudit.entityType,
      workflowTransitionAudit.fromStatus,
      workflowTransitionAudit.toStatus,
      workflowTransitionAudit.action,
    );

  const failureMap = new Map(
    collectorData.transitions.map((t) => [
      workflowTransitionMetricKey(
        t.entity_type,
        t.from_status,
        t.to_status,
        t.action,
      ),
      t,
    ]),
  );

  const mergedKeys = new Set<string>();
  const transitions: MergedMetricsResponse["transitions"] = [];

  for (const row of dbGroups) {
    const key = workflowTransitionMetricKey(
      row.entity_type,
      row.from_status,
      row.to_status,
      row.action,
    );
    mergedKeys.add(key);
    const f = failureMap.get(key);
    transitions.push({
      entity_type: row.entity_type,
      from_status: row.from_status,
      to_status: row.to_status,
      action: row.action,
      success_count: row.success_count,
      failure_count: f?.failure_count ?? 0,
      avg_duration_ms: f?.avg_duration_ms ?? 0,
      last_success: null,
      last_failure: f?.last_failure ?? null,
      last_error: f?.last_error ?? null,
    });
  }

  for (const t of collectorData.transitions) {
    const key = workflowTransitionMetricKey(
      t.entity_type,
      t.from_status,
      t.to_status,
      t.action,
    );
    if (mergedKeys.has(key) || t.failure_count === 0) {
      continue;
    }
    transitions.push({
      entity_type: t.entity_type,
      from_status: t.from_status,
      to_status: t.to_status,
      action: t.action,
      success_count: 0,
      failure_count: t.failure_count,
      avg_duration_ms: t.avg_duration_ms,
      last_success: t.last_success,
      last_failure: t.last_failure,
      last_error: t.last_error,
    });
  }

  transitions.sort(
    (a, b) =>
      b.success_count +
      b.failure_count -
      (a.success_count + a.failure_count),
  );

  const totalFailures = collectorData.overall.total_failures;
  const totalConflicts = collectorData.overall.total_conflicts;
  const totalTransitions = totalSuccesses + totalFailures;
  const successRate =
    totalTransitions > 0 ?
      Math.round((totalSuccesses / totalTransitions) * 10000) / 100
    : 100;

  return {
    total_transitions: totalTransitions,
    total_successes: totalSuccesses,
    total_failures: totalFailures,
    total_conflicts: totalConflicts,
    success_rate: successRate,
    avg_duration_ms: collectorData.overall.avg_duration_ms,
    uptime_seconds: collectorData.overall.uptime_seconds,
    start_time: collectorData.overall.start_time,
    transitions,
    recent_errors: collectorData.recent_errors,
  };
}

export function mergedMetricsToPrometheus(m: MergedMetricsResponse): string {
  const lines: string[] = [];
  lines.push(
    "# HELP workflow_transitions_total Total number of workflow transitions (audit successes + in-process failures)",
  );
  lines.push("# TYPE workflow_transitions_total counter");
  lines.push(`workflow_transitions_total ${m.total_transitions}`);
  lines.push("# HELP workflow_transitions_success_total Rows in workflow_transition_audit");
  lines.push("# TYPE workflow_transitions_success_total counter");
  lines.push(`workflow_transitions_success_total ${m.total_successes}`);
  lines.push("# HELP workflow_transitions_failure_total Failed transitions (in-process)");
  lines.push("# TYPE workflow_transitions_failure_total counter");
  lines.push(`workflow_transitions_failure_total ${m.total_failures}`);
  lines.push("# HELP workflow_conflicts_total Concurrency conflicts");
  lines.push("# TYPE workflow_conflicts_total counter");
  lines.push(`workflow_conflicts_total ${m.total_conflicts}`);
  lines.push("# HELP workflow_transition_count Transitions by type");
  lines.push("# TYPE workflow_transition_count counter");
  lines.push(
    "# HELP workflow_transition_duration_ms Avg duration when in-process samples exist",
  );
  lines.push("# TYPE workflow_transition_duration_ms gauge");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  for (const t of m.transitions) {
    const labels = `entity="${esc(t.entity_type)}",from="${esc(t.from_status)}",to="${esc(t.to_status)}",action="${esc(t.action)}"`;
    lines.push(
      `workflow_transition_count{${labels},result="success"} ${t.success_count}`,
    );
    lines.push(
      `workflow_transition_count{${labels},result="failure"} ${t.failure_count}`,
    );
    if (t.avg_duration_ms > 0) {
      lines.push(
        `workflow_transition_duration_ms{${labels}} ${t.avg_duration_ms.toFixed(2)}`,
      );
    }
  }
  return lines.join("\n");
}
