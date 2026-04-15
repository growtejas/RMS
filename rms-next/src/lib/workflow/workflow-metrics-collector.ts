/**
 * Port of `backend/services/requisition/workflow_metrics.py` (in-process counters).
 * Failure counts are driven by `workflowCatch` + `recordWorkflowMetricFailure`.
 * Success counts for the HTTP metrics payload come from `workflow_transition_audit` (see `workflow-metrics-merged.ts`).
 */

type TransitionKey = string;

type TransitionMetric = {
  entity_type: string;
  from_status: string;
  to_status: string;
  action: string;
  success_count: number;
  failure_count: number;
  total_duration_ms: number;
  last_success: Date | null;
  last_failure: Date | null;
  last_error: string | null;
};

type OverallMetrics = {
  total_transitions: number;
  total_successes: number;
  total_failures: number;
  total_conflicts: number;
  start_time: Date;
};

const globalForMetrics = globalThis as unknown as {
  __workflowMetricsCollector?: WorkflowMetricsCollector;
};

function makeKey(
  entityType: string,
  fromStatus: string,
  toStatus: string,
  action: string,
): TransitionKey {
  return `${entityType}:${fromStatus}:${toStatus}:${action}`;
}

export class WorkflowMetricsCollector {
  private transitionMetrics = new Map<TransitionKey, TransitionMetric>();
  private overall: OverallMetrics = {
    total_transitions: 0,
    total_successes: 0,
    total_failures: 0,
    total_conflicts: 0,
    start_time: new Date(),
  };
  private errorLog: { ts: Date; key: string; error: string }[] = [];
  private readonly maxErrorLog = 1000;

  static getInstance(): WorkflowMetricsCollector {
    if (!globalForMetrics.__workflowMetricsCollector) {
      globalForMetrics.__workflowMetricsCollector = new WorkflowMetricsCollector();
    }
    return globalForMetrics.__workflowMetricsCollector;
  }

  recordSuccess(
    entityType: string,
    fromStatus: string,
    toStatus: string,
    action: string,
    durationMs: number,
  ): void {
    const key = makeKey(entityType, fromStatus, toStatus, action);
    const now = new Date();
    let m = this.transitionMetrics.get(key);
    if (!m) {
      m = {
        entity_type: entityType,
        from_status: fromStatus,
        to_status: toStatus,
        action,
        success_count: 0,
        failure_count: 0,
        total_duration_ms: 0,
        last_success: null,
        last_failure: null,
        last_error: null,
      };
      this.transitionMetrics.set(key, m);
    }
    m.success_count += 1;
    m.total_duration_ms += durationMs;
    m.last_success = now;
    this.overall.total_transitions += 1;
    this.overall.total_successes += 1;
  }

  recordFailure(
    entityType: string,
    fromStatus: string,
    toStatus: string,
    action: string,
    error: string,
    isConflict = false,
  ): void {
    const key = makeKey(entityType, fromStatus, toStatus, action);
    const now = new Date();
    let m = this.transitionMetrics.get(key);
    if (!m) {
      m = {
        entity_type: entityType,
        from_status: fromStatus,
        to_status: toStatus,
        action,
        success_count: 0,
        failure_count: 0,
        total_duration_ms: 0,
        last_success: null,
        last_failure: null,
        last_error: null,
      };
      this.transitionMetrics.set(key, m);
    }
    m.failure_count += 1;
    m.last_failure = now;
    m.last_error = error;
    this.overall.total_transitions += 1;
    this.overall.total_failures += 1;
    if (isConflict) {
      this.overall.total_conflicts += 1;
    }
    this.errorLog.push({ ts: now, key, error });
    if (this.errorLog.length > this.maxErrorLog) {
      this.errorLog = this.errorLog.slice(-this.maxErrorLog);
    }
  }

  getMetrics(): {
    overall: {
      total_transitions: number;
      total_successes: number;
      total_failures: number;
      total_conflicts: number;
      success_rate: number;
      avg_duration_ms: number;
      uptime_seconds: number;
      start_time: string;
    };
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
  } {
    const uptime =
      (Date.now() - this.overall.start_time.getTime()) / 1000;
    const transitions: {
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
    }[] = [];

    let totalDuration = 0;
    let totalWithDuration = 0;

    for (const m of Array.from(this.transitionMetrics.values())) {
      const avgDuration =
        m.success_count > 0 ? m.total_duration_ms / m.success_count : 0;
      transitions.push({
        entity_type: m.entity_type,
        from_status: m.from_status,
        to_status: m.to_status,
        action: m.action,
        success_count: m.success_count,
        failure_count: m.failure_count,
        avg_duration_ms: Math.round(avgDuration * 100) / 100,
        last_success: m.last_success?.toISOString() ?? null,
        last_failure: m.last_failure?.toISOString() ?? null,
        last_error: m.last_error,
      });
      totalDuration += m.total_duration_ms;
      totalWithDuration += m.success_count;
    }

    transitions.sort(
      (a, b) =>
        b.success_count +
        b.failure_count -
        (a.success_count + a.failure_count),
    );

    const overallAvg =
      totalWithDuration > 0 ? totalDuration / totalWithDuration : 0;

    const total = this.overall.total_transitions;
    const successRate =
      total > 0
        ? Math.round((this.overall.total_successes / total) * 10000) / 100
        : 100;

    return {
      overall: {
        total_transitions: this.overall.total_transitions,
        total_successes: this.overall.total_successes,
        total_failures: this.overall.total_failures,
        total_conflicts: this.overall.total_conflicts,
        success_rate: successRate,
        avg_duration_ms: Math.round(overallAvg * 100) / 100,
        uptime_seconds: Math.round(uptime * 10) / 10,
        start_time: this.overall.start_time.toISOString(),
      },
      transitions,
      recent_errors: this.errorLog.slice(-10).map((e) => ({
        timestamp: e.ts.toISOString(),
        transition: e.key,
        error: e.error,
      })),
    };
  }

  getPrometheusMetrics(): string {
    const lines: string[] = [];
    lines.push(
      "# HELP workflow_transitions_total Total number of workflow transitions",
    );
    lines.push("# TYPE workflow_transitions_total counter");
    lines.push(
      `workflow_transitions_total ${this.overall.total_transitions}`,
    );
    lines.push(
      "# HELP workflow_transitions_success_total Successful transitions",
    );
    lines.push("# TYPE workflow_transitions_success_total counter");
    lines.push(
      `workflow_transitions_success_total ${this.overall.total_successes}`,
    );
    lines.push(
      "# HELP workflow_transitions_failure_total Failed transitions",
    );
    lines.push("# TYPE workflow_transitions_failure_total counter");
    lines.push(
      `workflow_transitions_failure_total ${this.overall.total_failures}`,
    );
    lines.push("# HELP workflow_conflicts_total Concurrency conflicts");
    lines.push("# TYPE workflow_conflicts_total counter");
    lines.push(`workflow_conflicts_total ${this.overall.total_conflicts}`);
    lines.push("# HELP workflow_transition_count Transitions by type");
    lines.push("# TYPE workflow_transition_count counter");

    const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    for (const m of Array.from(this.transitionMetrics.values())) {
      const labels = `entity="${esc(m.entity_type)}",from="${esc(m.from_status)}",to="${esc(m.to_status)}",action="${esc(m.action)}"`;
      lines.push(
        `workflow_transition_count{${labels},result="success"} ${m.success_count}`,
      );
      lines.push(
        `workflow_transition_count{${labels},result="failure"} ${m.failure_count}`,
      );
    }

    lines.push(
      "# HELP workflow_transition_duration_ms Transition duration",
    );
    lines.push("# TYPE workflow_transition_duration_ms gauge");
    for (const m of Array.from(this.transitionMetrics.values())) {
      if (m.success_count > 0) {
        const avg = m.total_duration_ms / m.success_count;
        const labels = `entity="${esc(m.entity_type)}",from="${esc(m.from_status)}",to="${esc(m.to_status)}",action="${esc(m.action)}"`;
        lines.push(
          `workflow_transition_duration_ms{${labels}} ${avg.toFixed(2)}`,
        );
      }
    }

    return lines.join("\n");
  }

  /** Test helper — parity with Python `reset_workflow_metrics`. */
  reset(): void {
    this.transitionMetrics.clear();
    this.overall = {
      total_transitions: 0,
      total_successes: 0,
      total_failures: 0,
      total_conflicts: 0,
      start_time: new Date(),
    };
    this.errorLog = [];
  }
}

export function getWorkflowMetrics() {
  return WorkflowMetricsCollector.getInstance().getMetrics();
}

export function getPrometheusMetricsText() {
  return WorkflowMetricsCollector.getInstance().getPrometheusMetrics();
}

export function recordWorkflowMetricFailure(
  entityType: string,
  fromStatus: string,
  toStatus: string,
  action: string,
  message: string,
  isConflict: boolean,
): void {
  WorkflowMetricsCollector.getInstance().recordFailure(
    entityType,
    fromStatus,
    toStatus,
    action,
    message,
    isConflict,
  );
}

export function recordWorkflowMetricSuccess(
  entityType: string,
  fromStatus: string,
  toStatus: string,
  action: string,
  durationMs = 0,
): void {
  WorkflowMetricsCollector.getInstance().recordSuccess(
    entityType,
    fromStatus,
    toStatus,
    action,
    durationMs,
  );
}
