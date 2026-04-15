import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import {
  isWorkflowException,
  type WorkflowException,
} from "@/lib/workflow/workflow-exceptions";
import { recordWorkflowExceptionMetrics } from "@/lib/workflow/workflow-exception-metrics";

export function workflowErrorResponse(e: WorkflowException): NextResponse {
  return NextResponse.json(e.toDict(), { status: e.httpStatus });
}

export function workflowCatch(e: unknown, logLabel: string): NextResponse {
  if (isWorkflowException(e)) {
    recordWorkflowExceptionMetrics(e);
    return workflowErrorResponse(e);
  }
  return referenceWriteCatch(e, logLabel);
}

export function workflowTransitionJson(params: {
  entityId: number;
  entityType: string;
  previousStatus: string;
  newStatus: string;
  transitionedBy: number;
}) {
  return {
    success: true,
    entity_id: params.entityId,
    entity_type: params.entityType,
    previous_status: params.previousStatus,
    new_status: params.newStatus,
    transitioned_at: new Date().toISOString(),
    transitioned_by: params.transitionedBy,
  };
}
