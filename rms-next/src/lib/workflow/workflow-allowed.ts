/**
 * F-003 allowed transitions — port of logic in `workflow_routes.py`.
 */

import type { RequisitionItemStatus, RequisitionStatus } from "@/types/workflow";
import {
  HEADER_TRANSITIONS,
  HEADER_TERMINAL_STATES,
  ITEM_BACKWARD_TRANSITIONS,
  ITEM_TERMINAL_STATES,
  ITEM_TRANSITIONS,
  getHeaderAuthorizedRoles,
  getItemAuthorizedRoles,
  isSystemOnlyHeaderTransition,
  isSystemOnlyItemTransition,
} from "@/lib/workflow/workflow-matrix";

const RS_REJECTED = "Rejected";
const RS_CANCELLED = "Cancelled";
const IS_CANCELLED = "Cancelled";

export type TransitionInfo = {
  target_status: string;
  authorized_roles: string[];
  requires_reason: boolean;
  is_system_only: boolean;
  description?: string;
};

export function buildAllowedHeaderTransitions(
  current: RequisitionStatus,
): TransitionInfo[] {
  const targets = HEADER_TRANSITIONS[current] ?? new Set();
  const out: TransitionInfo[] = [];
  for (const target of Array.from(targets)) {
    const authorized = getHeaderAuthorizedRoles(current, target);
    const isSystemOnly = isSystemOnlyHeaderTransition(current, target);
    const requiresReason =
      target === RS_REJECTED || target === RS_CANCELLED;
    out.push({
      target_status: target,
      authorized_roles: Array.from(authorized),
      requires_reason: requiresReason,
      is_system_only: isSystemOnly,
      description: `Transition from ${current} to ${target}`,
    });
  }
  return out;
}

export function buildAllowedItemTransitions(
  current: RequisitionItemStatus,
): TransitionInfo[] {
  const targets = ITEM_TRANSITIONS[current] ?? new Set();
  const out: TransitionInfo[] = [];
  for (const target of Array.from(targets)) {
    const authorized = getItemAuthorizedRoles(current, target);
    const isSystemOnly = isSystemOnlyItemTransition(current, target);
    const isBackward =
      ITEM_BACKWARD_TRANSITIONS[current]?.has(target) ?? false;
    const requiresReason = isBackward || target === IS_CANCELLED;
    out.push({
      target_status: target,
      authorized_roles: Array.from(authorized),
      requires_reason: requiresReason,
      is_system_only: isSystemOnly,
      description: `Transition from ${current} to ${target}`,
    });
  }
  return out;
}

export { HEADER_TERMINAL_STATES, ITEM_TERMINAL_STATES };
