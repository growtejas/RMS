/**
 * Interview Lifecycle service.
 *
 * Hybrid pipeline: top-level boxes are application stages
 * (`Sourced → Shortlisted → Interviewing → Offered → Hired`) and the
 * `Interviewing` box expands inline to show the interview rounds for the
 * application.
 *
 * The DB still stores legacy uppercase values (`SCHEDULED|COMPLETED|CANCELLED|NO_SHOW`
 * for status, `PASS|FAIL|HOLD|NULL` for result). All translation to the spec
 * vocabulary (`pending|passed|failed|no_show|cancelled`) lives in this file so
 * callers (UI/API) only ever see the new vocabulary.
 */

import type { ApiUser } from "@/lib/auth/api-guard";
import { HttpError } from "@/lib/http/http-error";
import * as applicationsRepo from "@/lib/repositories/applications-repo";
import * as ivRepo from "@/lib/repositories/interviews-repo";
import { patchCandidateStageJson } from "@/lib/services/candidates-service";
import {
  createInterviewJson,
  type InterviewJson,
} from "@/lib/services/interviews-service";
import type { InterviewCreateV2 } from "@/lib/validators/interviews";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const APPLICATION_STAGE_ORDER = [
  "Sourced",
  "Shortlisted",
  "Interviewing",
  "Offered",
  "Hired",
] as const;

export type AppStageKey = (typeof APPLICATION_STAGE_ORDER)[number];

export type LifecycleRoundStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rescheduled";

export type LifecycleResult = "pending" | "passed" | "failed" | "hold";

export type LifecycleColor =
  | "grey"
  | "blue"
  | "yellow"
  | "green"
  | "red"
  | "orange";

export type LifecycleStageState = "not_started" | "current" | "past" | "rejected";

const STATUS_DB_TO_LIFECYCLE: Record<string, LifecycleRoundStatus> = {
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
  RESCHEDULED: "rescheduled",
};

const RESULT_DB_TO_LIFECYCLE: Record<string, LifecycleResult> = {
  PASS: "passed",
  FAIL: "failed",
  HOLD: "hold",
};

const RESULT_LIFECYCLE_TO_DB: Record<LifecycleResult, string | null> = {
  pending: null,
  passed: "PASS",
  failed: "FAIL",
  hold: "HOLD",
};

export function toLifecycleStatus(db: string | null | undefined): LifecycleRoundStatus {
  if (!db) {
    return "scheduled";
  }
  const key = String(db).toUpperCase();
  return STATUS_DB_TO_LIFECYCLE[key] ?? "scheduled";
}

export function toLifecycleResult(db: string | null | undefined): LifecycleResult {
  if (!db) {
    return "pending";
  }
  const key = String(db).toUpperCase();
  return RESULT_DB_TO_LIFECYCLE[key] ?? "pending";
}

export function toDbResult(result: LifecycleResult): string | null {
  return RESULT_LIFECYCLE_TO_DB[result] ?? null;
}

/**
 * Color of an individual round box.
 *   - cancelled rounds are filtered out before render (per spec); this still
 *     handles them defensively.
 */
export function colorForRound(
  status: LifecycleRoundStatus,
  result: LifecycleResult,
): LifecycleColor {
  if (status === "cancelled") {
    return "grey";
  }
  if (status === "no_show") {
    return "orange";
  }
  if (status === "scheduled" || status === "rescheduled") {
    return "blue";
  }
  // status === "completed"
  if (result === "passed") {
    return "green";
  }
  if (result === "failed") {
    return "red";
  }
  if (result === "hold") {
    return "yellow";
  }
  return "yellow";
}

/** Color for a top-level application stage box. */
export function colorForStage(state: LifecycleStageState): LifecycleColor {
  switch (state) {
    case "past":
      return "green";
    case "current":
      return "blue";
    case "rejected":
      return "red";
    case "not_started":
    default:
      return "grey";
  }
}

// ---------------------------------------------------------------------------
// Shape returned to the client
// ---------------------------------------------------------------------------

export type LifecycleRoundJson = {
  interview_id: number;
  round_number: number;
  round_name: string | null;
  round_type: string | null;
  status: LifecycleRoundStatus;
  result: LifecycleResult;
  color: LifecycleColor;
  scheduled_at: string | null;
  end_time: string | null;
  meeting_link: string | null;
  location: string | null;
  feedback: string | null;
};

export type LifecycleStageJson = {
  key: AppStageKey;
  label: string;
  state: LifecycleStageState;
  color: LifecycleColor;
  rounds?: LifecycleRoundJson[];
};

export type LifecyclePayload = {
  application_id: number;
  candidate_id: number;
  current_stage: string;
  is_rejected: boolean;
  top_level: LifecycleStageJson[];
  can_schedule_next: boolean;
  next_round_number: number;
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function deriveStageState(
  stageKey: AppStageKey,
  currentStage: string,
  isRejected: boolean,
  rejectedAtStage?: AppStageKey,
): LifecycleStageState {
  const normalizedCurrent = APPLICATION_STAGE_ORDER.indexOf(
    currentStage as AppStageKey,
  );
  const stageIdx = APPLICATION_STAGE_ORDER.indexOf(stageKey);

  if (isRejected) {
    // Highlight the stage where rejection occurred (or inferred fallback),
    // while visually ending the pipeline.
    const rejectedIdx = rejectedAtStage
      ? APPLICATION_STAGE_ORDER.indexOf(rejectedAtStage)
      : normalizedCurrent;
    if (rejectedIdx === -1 || stageIdx > rejectedIdx) {
      return "not_started";
    }
    return stageIdx === rejectedIdx ? "rejected" : "past";
  }

  if (normalizedCurrent === -1) {
    // Unknown stage (e.g., custom) — treat first stage as current.
    return stageIdx === 0 ? "current" : "not_started";
  }

  if (stageIdx < normalizedCurrent) {
    return "past";
  }
  if (stageIdx === normalizedCurrent) {
    return "current";
  }
  return "not_started";
}

function roundToJson(row: ivRepo.InterviewRow): LifecycleRoundJson {
  const status = toLifecycleStatus(row.status);
  const result = toLifecycleResult(row.result);
  return {
    interview_id: row.id,
    round_number: row.roundNumber,
    round_name: row.roundName,
    round_type: row.roundType,
    status,
    result,
    color: colorForRound(status, result),
    scheduled_at: row.scheduledAt?.toISOString() ?? null,
    end_time: row.endTime?.toISOString() ?? null,
    meeting_link: row.meetingLink ?? null,
    location: row.location ?? null,
    feedback: row.feedback ?? null,
  };
}

/**
 * Latest non-cancelled round (by round_number desc, then scheduled_at desc).
 * Used for `can_schedule_next` and to determine where the candidate is right now.
 */
export function pickLatestActiveRound(
  rows: ivRepo.InterviewRow[],
): ivRepo.InterviewRow | null {
  const active = rows.filter((r) => String(r.status).toUpperCase() !== "CANCELLED");
  if (active.length === 0) {
    return null;
  }
  return [...active].sort((a, b) => {
    if (a.roundNumber !== b.roundNumber) {
      return b.roundNumber - a.roundNumber;
    }
    return (b.scheduledAt?.getTime() ?? 0) - (a.scheduledAt?.getTime() ?? 0);
  })[0];
}

/**
 * Returns true if a new round can be scheduled for the application.
 *   - true when no rounds exist yet, OR
 *   - true when the latest non-cancelled round is COMPLETED + PASS.
 */
export function canScheduleNextRoundFromRows(
  rows: ivRepo.InterviewRow[],
): boolean {
  const latest = pickLatestActiveRound(rows);
  if (!latest) {
    return true;
  }
  return (
    String(latest.status).toUpperCase() === "COMPLETED" &&
    String(latest.result ?? "").toUpperCase() === "PASS"
  );
}

export async function canScheduleNextRound(
  applicationId: number,
): Promise<boolean> {
  const rows = await ivRepo.selectInterviewsByApplication(applicationId);
  return canScheduleNextRoundFromRows(rows);
}

function maxRoundNumberFromRows(rows: ivRepo.InterviewRow[]): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.roundNumber ?? 0));
}

/**
 * Pure lifecycle projection shared by GET /applications/{id}/lifecycle and
 * bulk workspaces (same semantics as the former single-app path).
 */
export function buildLifecyclePayloadForApplication(params: {
  applicationId: number;
  candidateId: number;
  currentStage: string | null | undefined;
  interviewRows: ivRepo.InterviewRow[];
}): LifecyclePayload {
  const rows = params.interviewRows;
  const visibleRounds = rows
    .filter((r) => String(r.status).toUpperCase() !== "CANCELLED")
    .map(roundToJson);

  const currentStage = params.currentStage ?? "Sourced";
  const latest = pickLatestActiveRound(rows);
  const latestFailed =
    latest != null &&
    String(latest.status).toUpperCase() === "COMPLETED" &&
    String(latest.result ?? "").toUpperCase() === "FAIL";
  const isRejected = currentStage === "Rejected" || latestFailed;
  const rejectedAtStage: AppStageKey | undefined = latestFailed
    ? "Interviewing"
    : APPLICATION_STAGE_ORDER.includes(currentStage as AppStageKey)
      ? (currentStage as AppStageKey)
      : undefined;

  const topLevel: LifecycleStageJson[] = APPLICATION_STAGE_ORDER.map((key) => {
    const state = deriveStageState(key, currentStage, isRejected, rejectedAtStage);
    const stage: LifecycleStageJson = {
      key,
      label: key,
      state,
      color: colorForStage(state),
    };
    if (key === "Interviewing") {
      stage.rounds = visibleRounds;
    }
    return stage;
  });

  const maxRound = maxRoundNumberFromRows(rows);

  return {
    application_id: params.applicationId,
    candidate_id: params.candidateId,
    current_stage: currentStage,
    is_rejected: isRejected,
    top_level: topLevel,
    can_schedule_next: !isRejected && canScheduleNextRoundFromRows(rows),
    next_round_number: maxRound + 1,
  };
}

export async function getApplicationLifecycle(
  applicationId: number,
  organizationId: string,
): Promise<LifecyclePayload> {
  const app = await applicationsRepo.selectApplicationById(
    applicationId,
    organizationId,
  );
  if (!app) {
    throw new HttpError(404, "Application not found");
  }

  const rows = await ivRepo.selectInterviewsByApplication(applicationId);

  return buildLifecyclePayloadForApplication({
    applicationId: app.application.applicationId,
    candidateId: app.application.candidateId,
    currentStage: app.application.currentStage,
    interviewRows: rows,
  });
}

// ---------------------------------------------------------------------------
// Write — schedule next round
// ---------------------------------------------------------------------------

export type ScheduleNextRoundPayload = Omit<
  InterviewCreateV2,
  "candidate_id" | "requisition_item_id"
> & {
  application_id: number;
};

/**
 * Schedule the next interview round for an application.
 *
 * The actual creation goes through the existing `createInterviewJson(V2)` path
 * so we get all conflict checks, panelist resolution, audit + Calendar/Email
 * side-effects for free. We just gate it on `canScheduleNextRound` here.
 */
export async function scheduleNextRound(params: {
  payload: ScheduleNextRoundPayload;
  user: ApiUser;
}): Promise<{ interview: InterviewJson; warnings: string[] }> {
  const { payload, user } = params;
  const app = await applicationsRepo.selectApplicationById(
    payload.application_id,
    user.organizationId,
  );
  if (!app) {
    throw new HttpError(404, "Application not found");
  }
  if (app.application.currentStage === "Rejected") {
    throw new HttpError(
      409,
      "Cannot schedule a round on a rejected application",
    );
  }
  if (app.application.requisitionItemId == null) {
    throw new HttpError(
      422,
      "Application has no requisition line; cannot schedule round",
    );
  }

  const rows = await ivRepo.selectInterviewsByApplication(payload.application_id);
  if (!canScheduleNextRoundFromRows(rows)) {
    throw new HttpError(
      409,
      "Cannot schedule next round: previous round not passed",
    );
  }

  const v2: InterviewCreateV2 = {
    candidate_id: app.application.candidateId,
    requisition_item_id: app.application.requisitionItemId,
    round_name: payload.round_name,
    round_type: payload.round_type,
    interview_mode: payload.interview_mode,
    scheduled_at: payload.scheduled_at,
    end_time: payload.end_time,
    timezone: payload.timezone,
    interviewer_ids: payload.interviewer_ids,
    meeting_link: payload.meeting_link ?? null,
    location: payload.location ?? null,
    notes: payload.notes ?? null,
  };

  const out = await createInterviewJson(v2, user);
  return out as { interview: InterviewJson; warnings: string[] };
}

// ---------------------------------------------------------------------------
// Write — submit interview result
// ---------------------------------------------------------------------------

/**
 * Persist a result for an interview round.
 *   - Validates the row exists and belongs to the caller's organization.
 *   - Validates `status === COMPLETED` (per spec).
 *   - On `failed` → moves the candidate to `Rejected` via the canonical
 *     `patchCandidateStageJson` path so we get history + notifications.
 */
export async function submitInterviewResult(params: {
  interviewId: number;
  result: LifecycleResult;
  user: ApiUser;
  roles: string[];
}): Promise<LifecyclePayload> {
  const { interviewId, result, user, roles } = params;

  if (result === "pending") {
    throw new HttpError(422, "Result must be passed, failed, or hold");
  }

  // Authorization scope: must be visible to this org.
  const candRepoMod = await import("@/lib/repositories/candidates-repo");
  const row = await candRepoMod.selectInterviewById(interviewId, user.organizationId);
  if (!row) {
    throw new HttpError(404, "Interview not found");
  }
  if (String(row.status).toUpperCase() !== "COMPLETED") {
    throw new HttpError(
      409,
      "Result can only be submitted on a completed interview",
    );
  }

  const dbValue = toDbResult(result);
  if (!dbValue) {
    throw new HttpError(422, "Invalid result");
  }

  const updated = await ivRepo.updateInterviewResult({
    interviewId,
    result: dbValue,
    updatedBy: user.userId,
  });
  if (!updated) {
    throw new HttpError(500, "Failed to update interview result");
  }

  if (result === "failed") {
    const reason =
      `Failed interview round R${row.roundNumber}` +
      (row.roundName ? ` (${row.roundName})` : "");
    try {
      await patchCandidateStageJson(
        row.candidateId,
        "Rejected",
        user,
        roles,
        reason,
      );
    } catch (err) {
      // If the candidate is already Rejected (or the transition is invalid),
      // we keep the result update and surface a non-fatal warning by re-throwing
      // only when it's a true server error.
      if (!(err instanceof HttpError) || err.status >= 500) {
        throw err;
      }
    }
  }

  if (updated.applicationId == null) {
    throw new HttpError(
      500,
      "Interview is not linked to an application; cannot return lifecycle",
    );
  }
  return getApplicationLifecycle(updated.applicationId, user.organizationId);
}
