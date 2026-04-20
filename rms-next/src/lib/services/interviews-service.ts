import { eq } from "drizzle-orm";

import type { ApiUser } from "@/lib/auth/api-guard";
import { assertTaOwnershipForCandidate } from "@/lib/auth/ta-ownership";
import { getDb } from "@/lib/db";
import { auditLog, interviews } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import * as repo from "@/lib/repositories/candidates-repo";

function interviewToJson(
  row: repo.InterviewRow,
  extras?: { candidate_name?: string; candidate_email?: string | null },
) {
  return {
    id: row.id,
    candidate_id: row.candidateId,
    round_number: row.roundNumber,
    interviewer_name: row.interviewerName,
    scheduled_at: row.scheduledAt.toISOString(),
    status: row.status,
    result: row.result ?? null,
    feedback: row.feedback ?? null,
    conducted_by: row.conductedBy ?? null,
    created_at: row.createdAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    ...(extras
      ? {
          candidate_name: extras.candidate_name,
          candidate_email: extras.candidate_email ?? null,
        }
      : {}),
  };
}

function isPastSchedule(d: Date): boolean {
  return d.getTime() < Date.now();
}

export async function listInterviewsJson(
  organizationId: string,
  filters?: { candidateId?: number | null; requisitionId?: number | null },
) {
  const rows = await repo.selectInterviewsList(organizationId, filters);
  return rows.map((r) =>
    interviewToJson(r.interview, {
      candidate_name: r.candidateFullName,
      candidate_email: r.candidateEmail,
    }),
  );
}

export async function getInterviewJson(interviewId: number, organizationId: string) {
  const row = await repo.selectInterviewById(interviewId, organizationId);
  if (!row) {
    throw new HttpError(404, "Interview not found");
  }
  return interviewToJson(row);
}

export async function createInterviewJson(
  payload: {
    candidate_id: number;
    round_number: number;
    interviewer_name: string;
    scheduled_at: string;
  },
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

  const existing = await repo.countInterviewsForCandidate(payload.candidate_id);
  const roundNum = Math.max(payload.round_number, existing + 1);

  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(interviews)
      .values({
        candidateId: payload.candidate_id,
        roundNumber: roundNum,
        interviewerName: payload.interviewer_name,
        scheduledAt,
        status: "Scheduled",
        conductedBy: user.userId,
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
    return interviewToJson(row);
  });
}

export async function patchInterviewJson(
  interviewId: number,
  patch: {
    interviewer_name?: string;
    scheduled_at?: string;
    status?: string;
    result?: string | null;
    feedback?: string | null;
  },
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

  let scheduledAt: Date | undefined;
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

  const oldStatus = existing.status;
  const oldResult = existing.result;

  const row = await repo.updateInterviewRow(interviewId, {
    interviewerName: patch.interviewer_name,
    scheduledAt,
    status: patch.status,
    result: patch.result,
    feedback: patch.feedback,
  });
  if (!row) {
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

  if (changes.length) {
    await repo.insertInterviewAuditUpdate({
      interviewId,
      performedBy: user.userId,
      oldValue: `status=${oldStatus}, result=${oldResult}`,
      newValue: changes.join("; "),
    });
  }

  return interviewToJson(row);
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
