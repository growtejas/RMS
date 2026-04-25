import { eq } from "drizzle-orm";

import type { ApiUser } from "@/lib/auth/api-guard";
import { assertTaOwnershipForCandidate } from "@/lib/auth/ta-ownership";
import { getDb } from "@/lib/db";
import { auditLog, interviewPanelists, interviews } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import * as repo from "@/lib/repositories/candidates-repo";
import * as ivRepo from "@/lib/repositories/interviews-repo";
import type {
  InterviewCreateInput,
  InterviewCreateLegacy,
  InterviewCreateV2,
  InterviewPatchInput,
} from "@/lib/validators/interviews";

export type InterviewPanelistJson = {
  id: number;
  user_id: number | null;
  display_name: string;
  role_label: string | null;
};

export type InterviewJson = ReturnType<typeof interviewToJson>;

function unwrapCause(err: unknown): unknown {
  if (err && typeof err === "object" && "cause" in err) {
    return unwrapCause((err as { cause: unknown }).cause);
  }
  return err;
}

function pgCode(err: unknown): string | undefined {
  const c = unwrapCause(err);
  if (c && typeof c === "object" && "code" in c) {
    return String((c as { code: unknown }).code);
  }
  return undefined;
}

function panelistsToJson(
  rows: (typeof import("@/lib/db/schema").interviewPanelists.$inferSelect)[],
): InterviewPanelistJson[] {
  return rows.map((p) => ({
    id: p.id,
    user_id: p.userId ?? null,
    display_name: p.displayName,
    role_label: p.roleLabel ?? null,
  }));
}

function interviewToJson(
  row: repo.InterviewRow,
  options?: {
    panelists?: InterviewPanelistJson[];
    extras?: {
      candidate_name?: string;
      candidate_email?: string | null;
      requisition_id?: number | null;
      role_position?: string | null;
    };
  },
) {
  return {
    id: row.id,
    candidate_id: row.candidateId,
    requisition_item_id: row.requisitionItemId ?? null,
    round_number: row.roundNumber,
    round_name: row.roundName ?? null,
    round_type: row.roundType ?? null,
    interview_mode: row.interviewMode ?? null,
    interviewer_name: row.interviewerName ?? null,
    scheduled_at: row.scheduledAt.toISOString(),
    end_time: row.endTime.toISOString(),
    timezone: row.timezone,
    meeting_link: row.meetingLink ?? null,
    location: row.location ?? null,
    notes: row.notes ?? null,
    status: row.status,
    result: row.result ?? null,
    feedback: row.feedback ?? null,
    conducted_by: row.conductedBy ?? null,
    created_by: row.createdBy ?? null,
    updated_by: row.updatedBy ?? null,
    created_at: row.createdAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    panelists: options?.panelists ?? [],
    ...(options?.extras
      ? {
          candidate_name: options.extras.candidate_name,
          candidate_email: options.extras.candidate_email ?? null,
          requisition_id: options.extras.requisition_id ?? null,
          role_position: options.extras.role_position ?? null,
        }
      : {}),
  };
}

function isPastSchedule(d: Date): boolean {
  return d.getTime() < Date.now();
}

function isV2Payload(p: InterviewCreateInput): p is InterviewCreateV2 {
  return (
    "requisition_item_id" in p &&
    "interviewer_ids" in p &&
    Array.isArray((p as InterviewCreateV2).interviewer_ids)
  );
}

async function attachPanelistsMap(
  interviewIds: number[],
): Promise<Map<number, InterviewPanelistJson[]>> {
  const panelRows = await ivRepo.listPanelistsForInterviews(interviewIds);
  const m = new Map<number, InterviewPanelistJson[]>();
  for (const p of panelRows) {
    const list = m.get(p.interviewId) ?? [];
    list.push({
      id: p.id,
      user_id: p.userId ?? null,
      display_name: p.displayName,
      role_label: p.roleLabel ?? null,
    });
    m.set(p.interviewId, list);
  }
  return m;
}

export async function listInterviewsJson(
  organizationId: string,
  filters?: { candidateId?: number | null; requisitionId?: number | null },
) {
  const rows = await repo.selectInterviewsList(organizationId, filters);
  const ids = rows.map((r) => r.interview.id);
  const panelMap = await attachPanelistsMap(ids);
  return rows.map((r) =>
    interviewToJson(r.interview, {
      panelists: panelMap.get(r.interview.id) ?? [],
      extras: {
        candidate_name: r.candidateFullName,
        candidate_email: r.candidateEmail,
      },
    }),
  );
}

export async function listManagerInterviewsJson(user: ApiUser) {
  const rows = await ivRepo.listManagerInterviews({
    organizationId: user.organizationId,
    managerUserId: user.userId,
  });
  const ids = rows.map((r) => r.interview.id);
  const panelMap = await attachPanelistsMap(ids);
  return rows.map((r) =>
    interviewToJson(r.interview, {
      panelists: panelMap.get(r.interview.id) ?? [],
      extras: {
        candidate_name: r.candidateFullName,
        candidate_email: r.candidateEmail,
        requisition_id: r.requisitionId,
        role_position: r.rolePosition,
      },
    }),
  );
}

export async function getInterviewJson(interviewId: number, organizationId: string) {
  const row = await repo.selectInterviewById(interviewId, organizationId);
  if (!row) {
    throw new HttpError(404, "Interview not found");
  }
  const panelMap = await attachPanelistsMap([interviewId]);
  return interviewToJson(row, {
    panelists: panelMap.get(interviewId) ?? [],
  });
}

export async function createInterviewJson(payload: InterviewCreateInput, user: ApiUser) {
  if (isV2Payload(payload)) {
    return createInterviewV2(payload, user);
  }
  return createInterviewLegacy(payload as InterviewCreateLegacy, user);
}

export async function createInterviewAsManagerJson(
  payload: InterviewCreateV2,
  user: ApiUser,
) {
  const meta = await repo.selectRequisitionItemMetaByItemId(payload.requisition_item_id);
  if (!meta || meta.organizationId !== user.organizationId) {
    throw new HttpError(404, "Requisition item not found");
  }

  const owned = meta.raisedBy === user.userId;
  const panelist = await ivRepo.managerIsPanelistForCandidateItem({
    organizationId: user.organizationId,
    managerUserId: user.userId,
    candidateId: payload.candidate_id,
    requisitionItemId: payload.requisition_item_id,
  });

  if (!owned && !panelist) {
    throw new HttpError(403, "Not authorized to schedule interviews for this role");
  }

  // Reuse the same core validations and conflict checks as TA/HR/Admin scheduling.
  return createInterviewV2(payload, user, { skipOwnership: true });
}

async function createInterviewLegacy(
  payload: InterviewCreateLegacy,
  user: ApiUser,
) {
  const cand = await repo.selectCandidateById(
    payload.candidate_id,
    user.organizationId,
  );
  if (!cand) {
    throw new HttpError(404, "Candidate not found");
  }
  await assertTaOwnershipForCandidate(payload.candidate_id, user);

  const scheduledAt = new Date(payload.scheduled_at);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new HttpError(422, "Invalid scheduled_at");
  }
  if (isPastSchedule(scheduledAt)) {
    throw new HttpError(
      422,
      "You cannot select a past date for the interview schedule",
    );
  }

  const endTime = new Date(scheduledAt.getTime() + 60 * 60 * 1000);

  const existing = await repo.countInterviewsForCandidate(payload.candidate_id);
  const roundNum = Math.max(payload.round_number, existing + 1);

  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(interviews)
        .values({
          candidateId: payload.candidate_id,
          roundNumber: roundNum,
          interviewerName: payload.interviewer_name,
          scheduledAt,
          endTime,
          timezone: "UTC",
          status: "SCHEDULED",
          conductedBy: user.userId,
          createdBy: user.userId,
        })
        .returning();
      if (!row) {
        throw new HttpError(500, "Interview create failed");
      }
      await tx.insert(auditLog).values({
        entityName: "interview",
        entityId: String(row.id),
        action: "CREATE",
        performedBy: user.userId,
        newValue: `Round ${roundNum} scheduled for candidate ${cand.fullName} with ${payload.interviewer_name}`,
        performedAt: new Date(),
      });
      return { interview: interviewToJson(row, { panelists: [] }), warnings: [] as string[] };
    });
  } catch (e) {
    if (pgCode(e) === "23505") {
      throw new HttpError(
        409,
        "Could not create interview due to a duplicate or conflict",
      );
    }
    throw e;
  }
}

async function createInterviewV2(
  payload: InterviewCreateV2,
  user: ApiUser,
  options?: { skipOwnership?: boolean },
) {
  const cand = await repo.selectCandidateById(
    payload.candidate_id,
    user.organizationId,
  );
  if (!cand) {
    throw new HttpError(404, "Candidate not found");
  }
  if (!options?.skipOwnership) {
    await assertTaOwnershipForCandidate(payload.candidate_id, user);
  }

  const app = await ivRepo.findApplicationForSchedule({
    candidateId: payload.candidate_id,
    requisitionItemId: payload.requisition_item_id,
    organizationId: user.organizationId,
  });
  if (!app) {
    throw new HttpError(
      404,
      "No application found for this candidate on the selected requisition line",
    );
  }

  const scheduledAt = new Date(payload.scheduled_at);
  const endTime = new Date(payload.end_time);
  if (Number.isNaN(scheduledAt.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new HttpError(422, "Invalid scheduled_at or end_time");
  }
  if (endTime.getTime() <= scheduledAt.getTime()) {
    throw new HttpError(422, "end_time must be after scheduled_at");
  }
  if (isPastSchedule(scheduledAt) || isPastSchedule(endTime)) {
    throw new HttpError(
      422,
      "You cannot select a past window for the interview schedule",
    );
  }

  const interviewerIds = Array.from(new Set(payload.interviewer_ids));
  const invalid = await ivRepo.findInvalidOrganizationUserIds(
    interviewerIds,
    user.organizationId,
  );
  if (invalid.length > 0) {
    throw new HttpError(
      422,
      `Invalid interviewer user id(s): ${invalid.join(", ")}`,
    );
  }

  const conflicts = await ivRepo.findInterviewerConflicts({
    interviewerUserIds: interviewerIds,
    windowStart: scheduledAt,
    windowEnd: endTime,
  });
  if (conflicts.length > 0) {
    throw new HttpError(
      409,
      "One or more interviewers are already booked for this time window",
    );
  }

  const roundNum =
    (await ivRepo.maxRoundNumberForCandidateItem({
      candidateId: payload.candidate_id,
      requisitionItemId: payload.requisition_item_id,
    })) + 1;

  const nameMap = await ivRepo.resolveUserDisplayNames(interviewerIds);
  const displayNames = interviewerIds.map((id) => nameMap.get(id) ?? `user ${id}`);
  const primaryLabel = displayNames.join(", ");

  const warnings: string[] = [];
  if (
    payload.interview_mode === "ONLINE" &&
    !(payload.meeting_link && payload.meeting_link.trim())
  ) {
    warnings.push("Meeting link missing for ONLINE interview");
  }

  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(interviews)
        .values({
          candidateId: payload.candidate_id,
          requisitionItemId: payload.requisition_item_id,
          roundNumber: roundNum,
          roundName: payload.round_name.trim(),
          roundType: payload.round_type,
          interviewMode: payload.interview_mode,
          interviewerName: primaryLabel,
          scheduledAt,
          endTime,
          timezone: payload.timezone,
          meetingLink: payload.meeting_link?.trim() || null,
          location: payload.location?.trim() || null,
          notes: payload.notes?.trim() || null,
          status: "SCHEDULED",
          conductedBy: user.userId,
          createdBy: user.userId,
        })
        .returning();
      if (!row) {
        throw new HttpError(500, "Interview create failed");
      }

      await ivRepo.insertPanelistRows(
        tx,
        interviewerIds.map((id) => ({
          interviewId: row.id,
          userId: id,
          displayName: nameMap.get(id) ?? `user ${id}`,
        })),
      );

      const panelRows = await tx
        .select()
        .from(interviewPanelists)
        .where(eq(interviewPanelists.interviewId, row.id));

      await tx.insert(auditLog).values({
        entityName: "interview",
        entityId: String(row.id),
        action: "CREATE",
        performedBy: user.userId,
        newValue: `${payload.round_name} (${payload.round_type}) scheduled for ${cand.fullName}`,
        performedAt: new Date(),
      });

      return {
        interview: interviewToJson(row, {
          panelists: panelistsToJson(panelRows),
        }),
        warnings,
      };
    });
  } catch (e) {
    if (pgCode(e) === "23505") {
      throw new HttpError(
        409,
        "An active interview round with this name already exists for this candidate and position, or duplicate interviewer rows",
      );
    }
    throw e;
  }
}

export async function patchInterviewJson(
  interviewId: number,
  patch: InterviewPatchInput,
  user: ApiUser,
) {
  const existing = await repo.selectInterviewById(
    interviewId,
    user.organizationId,
  );
  if (!existing) {
    throw new HttpError(404, "Interview not found");
  }
  await assertTaOwnershipForCandidate(existing.candidateId, user);

  const normStatus = (s: string) => s.toUpperCase();
  const existingStatus = normStatus(existing.status);

  if (patch.status != null && normStatus(patch.status) === "CANCELLED") {
    if (existingStatus === "CANCELLED") {
      const panelMap = await attachPanelistsMap([interviewId]);
      return {
        interview: interviewToJson(existing, {
          panelists: panelMap.get(interviewId) ?? [],
        }),
        warnings: [] as string[],
      };
    }
  }

  if (existingStatus === "COMPLETED") {
    const triesReschedule =
      patch.scheduled_at != null ||
      patch.end_time != null ||
      patch.interviewer_ids != null ||
      patch.timezone != null;
    if (triesReschedule) {
      throw new HttpError(409, "Cannot reschedule a completed interview");
    }
  }

  let scheduledAt: Date | undefined;
  let endTime: Date | undefined;
  if (patch.scheduled_at !== undefined) {
    scheduledAt = new Date(patch.scheduled_at);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new HttpError(422, "Invalid scheduled_at");
    }
    if (isPastSchedule(scheduledAt)) {
      throw new HttpError(
        422,
        "You cannot select a past date for the interview schedule",
      );
    }
  }
  if (patch.end_time !== undefined) {
    endTime = new Date(patch.end_time);
    if (Number.isNaN(endTime.getTime())) {
      throw new HttpError(422, "Invalid end_time");
    }
    if (isPastSchedule(endTime)) {
      throw new HttpError(
        422,
        "You cannot select a past end time for the interview schedule",
      );
    }
  }

  const nextStart = scheduledAt ?? existing.scheduledAt;
  const nextEnd = endTime ?? existing.endTime;
  if (nextEnd.getTime() <= nextStart.getTime()) {
    throw new HttpError(422, "end_time must be after scheduled_at");
  }

  if (patch.interviewer_ids != null && existingStatus === "COMPLETED") {
    throw new HttpError(409, "Cannot change interviewers on a completed interview");
  }

  if (patch.interviewer_ids != null) {
    const interviewerIds = Array.from(new Set(patch.interviewer_ids));
    const invalid = await ivRepo.findInvalidOrganizationUserIds(
      interviewerIds,
      user.organizationId,
    );
    if (invalid.length > 0) {
      throw new HttpError(
        422,
        `Invalid interviewer user id(s): ${invalid.join(", ")}`,
      );
    }
    const conflicts = await ivRepo.findInterviewerConflicts({
      interviewerUserIds: interviewerIds,
      windowStart: nextStart,
      windowEnd: nextEnd,
      excludeInterviewId: interviewId,
    });
    if (conflicts.length > 0) {
      throw new HttpError(
        409,
        "One or more interviewers are already booked for this time window",
      );
    }
  } else if (scheduledAt != null || endTime != null) {
    const panelRows = await ivRepo.listPanelistsForInterviews([interviewId]);
    const ids = panelRows
      .map((p) => p.userId)
      .filter((id): id is number => id != null);
    if (ids.length > 0) {
      const conflicts = await ivRepo.findInterviewerConflicts({
        interviewerUserIds: ids,
        windowStart: nextStart,
        windowEnd: nextEnd,
        excludeInterviewId: interviewId,
      });
      if (conflicts.length > 0) {
        throw new HttpError(
          409,
          "One or more interviewers are already booked for this time window",
        );
      }
    }
  }

  const warnings: string[] = [];
  const mode =
    patch.interview_mode ??
    (existing.interviewMode as "ONLINE" | "OFFLINE" | null | undefined);
  const link =
    patch.meeting_link !== undefined
      ? patch.meeting_link
      : existing.meetingLink;
  if (mode === "ONLINE" && !(link && String(link).trim())) {
    warnings.push("Meeting link missing for ONLINE interview");
  }

  const oldStatus = existing.status;
  const oldResult = existing.result;

  const timeChanged =
    (scheduledAt != null &&
      scheduledAt.getTime() !== existing.scheduledAt.getTime()) ||
    (endTime != null && endTime.getTime() !== existing.endTime.getTime());

  const db = getDb();
  try {
    const row = await db.transaction(async (tx) => {
      if (timeChanged) {
        await ivRepo.insertRescheduleRow(tx, {
          interviewId,
          oldScheduledAt: existing.scheduledAt,
          newScheduledAt: scheduledAt ?? existing.scheduledAt,
          oldEndTime: existing.endTime,
          newEndTime: endTime ?? existing.endTime,
          changedBy: user.userId,
          reason: patch.reschedule_reason ?? null,
        });
      }

      let newInterviewerLabel: string | undefined;
      if (patch.interviewer_name !== undefined && patch.interviewer_ids == null) {
        newInterviewerLabel = patch.interviewer_name;
      }
      if (patch.interviewer_ids != null) {
        await ivRepo.deletePanelistsForInterview(tx, interviewId);
        const interviewerIds = Array.from(new Set(patch.interviewer_ids));
        const nameMap = await ivRepo.resolveUserDisplayNames(interviewerIds);
        await ivRepo.insertPanelistRows(
          tx,
          interviewerIds.map((id) => ({
            interviewId,
            userId: id,
            displayName: nameMap.get(id) ?? `user ${id}`,
          })),
        );
        newInterviewerLabel = interviewerIds
          .map((id) => nameMap.get(id) ?? `user ${id}`)
          .join(", ");
      }

      const updated = await ivRepo.updateInterviewFull(tx, interviewId, {
        interviewerName: newInterviewerLabel,
        scheduledAt,
        endTime,
        timezone: patch.timezone,
        meetingLink:
          patch.meeting_link === undefined ? undefined : patch.meeting_link,
        location: patch.location === undefined ? undefined : patch.location,
        notes: patch.notes === undefined ? undefined : patch.notes,
        status: patch.status,
        result: patch.result === undefined ? undefined : patch.result,
        feedback: patch.feedback === undefined ? undefined : patch.feedback,
        roundName: patch.round_name === undefined ? undefined : patch.round_name,
        roundType: patch.round_type,
        interviewMode: patch.interview_mode,
        updatedBy: user.userId,
      });
      if (!updated) {
        throw new HttpError(404, "Interview not found");
      }

      const changes: string[] = [];
      if (patch.status !== undefined && patch.status !== oldStatus) {
        changes.push(`status: ${oldStatus} → ${patch.status}`);
      }
      if (patch.result !== undefined && patch.result !== oldResult) {
        changes.push(`result: ${oldResult} → ${patch.result}`);
      }
      if (patch.feedback !== undefined) {
        changes.push("feedback updated");
      }
      if (timeChanged) {
        changes.push("rescheduled");
      }
      if (patch.interviewer_ids != null) {
        changes.push("interviewers replaced");
      }

      if (changes.length) {
        await repo.insertInterviewAuditUpdate({
          interviewId,
          performedBy: user.userId,
          oldValue: `status=${oldStatus}, result=${oldResult}`,
          newValue: changes.join("; "),
        });
      }

      return updated;
    });

    const panelMap = await attachPanelistsMap([interviewId]);
    return {
      interview: interviewToJson(row, {
        panelists: panelMap.get(interviewId) ?? [],
      }),
      warnings,
    };
  } catch (e) {
    if (pgCode(e) === "23505") {
      throw new HttpError(409, "Update conflicts with an existing interview constraint");
    }
    throw e;
  }
}

export async function patchInterviewAsManagerJson(
  interviewId: number,
  patch: InterviewPatchInput,
  user: ApiUser,
) {
  const existing = await repo.selectInterviewById(interviewId, user.organizationId);
  if (!existing) {
    throw new HttpError(404, "Interview not found");
  }

  const allowed = await ivRepo.managerHasAccessToInterview({
    organizationId: user.organizationId,
    managerUserId: user.userId,
    interviewId,
  });
  if (!allowed) {
    throw new HttpError(403, "Not authorized to update this interview");
  }

  const triesDisallowed =
    patch.status !== undefined ||
    patch.scheduled_at !== undefined ||
    patch.end_time !== undefined ||
    patch.timezone !== undefined ||
    patch.meeting_link !== undefined ||
    patch.location !== undefined ||
    patch.round_name !== undefined ||
    patch.round_type !== undefined ||
    patch.interview_mode !== undefined ||
    patch.interviewer_name !== undefined ||
    patch.interviewer_ids !== undefined ||
    patch.reschedule_reason !== undefined;
  if (triesDisallowed) {
    throw new HttpError(403, "Managers can only update result, feedback, and notes");
  }

  const db = getDb();
  const updated = await db.transaction(async (tx) => {
    const row = await ivRepo.updateInterviewFull(tx, interviewId, {
      notes: patch.notes === undefined ? undefined : patch.notes,
      result: patch.result === undefined ? undefined : patch.result,
      feedback: patch.feedback === undefined ? undefined : patch.feedback,
      updatedBy: user.userId,
    });
    if (!row) {
      throw new HttpError(404, "Interview not found");
    }

    await repo.insertInterviewAuditUpdate({
      interviewId,
      performedBy: user.userId,
      oldValue: `status=${existing.status}, result=${existing.result ?? ""}`,
      newValue: [
        patch.result !== undefined ? `result → ${patch.result}` : null,
        patch.feedback !== undefined ? "feedback updated" : null,
        patch.notes !== undefined ? "notes updated" : null,
      ]
        .filter(Boolean)
        .join("; "),
    });

    return row;
  });

  const panelMap = await attachPanelistsMap([interviewId]);
  return {
    interview: interviewToJson(updated, {
      panelists: panelMap.get(interviewId) ?? [],
    }),
    warnings: [] as string[],
  };
}

export async function deleteInterviewJson(
  interviewId: number,
  user: ApiUser,
): Promise<void> {
  const existing = await repo.selectInterviewById(
    interviewId,
    user.organizationId,
  );
  if (!existing) {
    throw new HttpError(404, "Interview not found");
  }
  await assertTaOwnershipForCandidate(existing.candidateId, user);

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(auditLog).values({
      entityName: "interview",
      entityId: String(interviewId),
      action: "DELETE",
      performedBy: user.userId,
      oldValue: `Deleted round ${existing.roundNumber} for candidate ${existing.candidateId}`,
      performedAt: new Date(),
    });
    await tx.delete(interviews).where(eq(interviews.id, interviewId));
  });
}
