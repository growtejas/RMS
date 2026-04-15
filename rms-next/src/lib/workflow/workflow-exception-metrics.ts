import type { WorkflowException } from "@/lib/workflow/workflow-exceptions";
import { recordWorkflowMetricFailure } from "@/lib/workflow/workflow-metrics-collector";

/** Best-effort dimensions for in-process failure metrics (parity with Python collector). */
export function recordWorkflowExceptionMetrics(e: WorkflowException): void {
  const d = e.details;
  let entityType =
    typeof d.entity_type === "string" ? d.entity_type : "unknown";
  let fromStatus =
    typeof d.from_status === "string" ? d.from_status : "unknown";
  let toStatus =
    typeof d.to_status === "string" ? d.to_status : "unknown";
  let action = e.code;

  if (e.code === "CONFLICT") {
    entityType =
      typeof d.entity_type === "string" ? d.entity_type : "unknown";
    fromStatus = "unknown";
    toStatus = "unknown";
    action = "CONFLICT";
  }

  if (entityType === "entity") {
    entityType = "unknown";
  }

  recordWorkflowMetricFailure(
    entityType,
    fromStatus,
    toStatus,
    action,
    e.message,
    e.code === "CONFLICT",
  );
}
