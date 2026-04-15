/**
 * Port of `backend/services/requisition/workflow_exceptions.py`.
 * JSON shape matches `WorkflowErrorResponse` (root body for Next workflow routes).
 */

export type WorkflowErrorBody = {
  error: true;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export class WorkflowException extends Error {
  readonly httpStatus: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    code = "WORKFLOW_ERROR",
    httpStatus = 400,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "WorkflowException";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  toDict(): WorkflowErrorBody {
    return {
      error: true,
      code: this.code,
      message: this.message,
      details:
        Object.keys(this.details).length > 0 ? this.details : undefined,
    };
  }
}

export class InvalidTransitionException extends WorkflowException {
  constructor(
    fromStatus: string,
    toStatus: string,
    entityType = "entity",
    allowedTransitions: string[] = [],
  ) {
    let message = `Invalid transition: cannot move ${entityType} from '${fromStatus}' to '${toStatus}'.`;
    message += allowedTransitions.length
      ? ` Allowed transitions: ${allowedTransitions.join(", ")}`
      : " No transitions allowed from current state.";
    super(message, "INVALID_TRANSITION", 400, {
      entity_type: entityType,
      from_status: fromStatus,
      to_status: toStatus,
      allowed_transitions: allowedTransitions,
    });
  }
}

export class TerminalStateException extends WorkflowException {
  constructor(currentStatus: string, entityType = "entity", entityId?: number) {
    super(
      `Cannot transition ${entityType}: current status '${currentStatus}' is a terminal state. Terminal states are irreversible.`,
      "TERMINAL_STATE",
      400,
      {
        entity_type: entityType,
        entity_id: entityId,
        current_status: currentStatus,
        terminal: true,
      },
    );
  }
}

export class AuthorizationException extends WorkflowException {
  constructor(
    action: string,
    userRoles: string[],
    requiredRoles: string[] = [],
    reason?: string,
  ) {
    const message = reason
      ? reason
      : `User with roles ${JSON.stringify(userRoles)} is not authorized to perform action '${action}'.` +
        (requiredRoles.length
          ? ` Required roles: ${requiredRoles.join(", ")}`
          : "");
    super(message, "UNAUTHORIZED_TRANSITION", 403, {
      action,
      user_roles: userRoles,
      required_roles: requiredRoles,
    });
  }
}

export class ConcurrencyConflictException extends WorkflowException {
  constructor(
    entityType: string,
    entityId: number,
    expectedVersion: number,
    actualVersion: number,
  ) {
    super(
      `Concurrent modification detected on ${entityType} ${entityId}. Expected version ${expectedVersion}, but found version ${actualVersion}. Please refresh and retry.`,
      "CONFLICT",
      409,
      {
        entity_type: entityType,
        entity_id: entityId,
        expected_version: expectedVersion,
        actual_version: actualVersion,
      },
    );
  }
}

export class EntityLockedException extends WorkflowException {
  constructor(entityType: string, entityId: number, reason: string) {
    super(`${entityType} ${entityId} is locked: ${reason}`, "LOCKED", 423, {
      entity_type: entityType,
      entity_id: entityId,
      reason,
    });
  }
}

export class ValidationException extends WorkflowException {
  constructor(field: string, message: string, value?: unknown) {
    super(
      `Validation error on '${field}': ${message}`,
      "VALIDATION_ERROR",
      422,
      { field, message, value },
    );
  }
}

export class PrerequisiteException extends WorkflowException {
  constructor(
    transition: string,
    prerequisite: string,
    entityType = "entity",
    entityId?: number,
  ) {
    super(
      `Cannot perform transition '${transition}' on ${entityType}: prerequisite not met - ${prerequisite}`,
      "PREREQUISITE_NOT_MET",
      400,
      {
        entity_type: entityType,
        entity_id: entityId,
        transition,
        prerequisite,
      },
    );
  }
}

export class EntityNotFoundException extends WorkflowException {
  constructor(entityType: string, entityId: string | number) {
    super(`${entityType} with id '${entityId}' not found`, "NOT_FOUND", 404, {
      entity_type: entityType,
      entity_id: entityId,
    });
  }
}

export class AuditWriteException extends WorkflowException {
  constructor(operation: string, originalError?: string) {
    let message = `Failed to write audit log for operation '${operation}'`;
    if (originalError) {
      message += `: ${originalError}`;
    }
    message += ". Transaction rolled back.";
    super(message, "AUDIT_WRITE_FAILURE", 500, {
      operation,
      original_error: originalError,
    });
  }
}

export class SystemOnlyTransitionException extends WorkflowException {
  constructor(fromStatus: string, toStatus: string, entityType = "entity") {
    super(
      `Transition from '${fromStatus}' to '${toStatus}' on ${entityType} is system-controlled and cannot be triggered manually.`,
      "SYSTEM_ONLY_TRANSITION",
      403,
      {
        entity_type: entityType,
        from_status: fromStatus,
        to_status: toStatus,
        system_only: true,
      },
    );
  }
}

export class ReasonRequiredException extends WorkflowException {
  constructor(fromStatus: string, toStatus: string, minLength = 10) {
    super(
      `Backward transition from '${fromStatus}' to '${toStatus}' requires a reason with at least ${minLength} characters.`,
      "REASON_REQUIRED",
      422,
      { from_status: fromStatus, to_status: toStatus, min_length: minLength },
    );
  }
}

export function isWorkflowException(e: unknown): e is WorkflowException {
  return e instanceof WorkflowException;
}
