import type { ApiUser } from "@/lib/auth/api-guard";
import { maybeSyncInterviewGoogleCalendarEvent } from "@/lib/integrations/google-calendar-interview-stub";
import { enqueueNotificationDeliveryJob } from "@/lib/queue/notification-delivery-queue";
import {
  removeInterviewReminderJobs,
  scheduleInterviewReminderJobs,
} from "@/lib/queue/lifecycle-reminders-queue";
import * as applicationsRepo from "@/lib/repositories/applications-repo";
import * as ivRepo from "@/lib/repositories/interviews-repo";
import type { InterviewCreateV2 } from "@/lib/validators/interviews";
import {
  enqueueInterviewScheduledInterviewerNotification,
  enqueueInterviewRescheduledNotification,
  enqueueInterviewScheduledNotification,
} from "@/lib/services/lifecycle-notifications";
import type { InterviewRow } from "@/lib/repositories/candidates-repo";

type CandRow = {
  candidateId: number;
  fullName: string;
  email: string;
  requisitionId: number;
};

/**
 * After V2 create (success). Never throws; logs are best-effort.
 */
export async function runSideEffectsAfterInterviewCreateV2(input: {
  user: ApiUser;
  app: { applicationId: number };
  cand: CandRow;
  row: InterviewRow;
  payload: InterviewCreateV2;
  interviewerLabel: string;
}): Promise<void> {
  const { user, app, cand, row, payload, interviewerLabel } = input;
  try {
    await maybeSyncInterviewGoogleCalendarEvent({
      interviewId: row.id,
      organizationId: user.organizationId,
    });
  } catch {
    /* optional */
  }
  try {
    await scheduleInterviewReminderJobs({
      interviewId: row.id,
      organizationId: user.organizationId,
      scheduledAt: row.scheduledAt,
    });
  } catch {
    /* redis optional */
  }
  try {
    await enqueueInterviewScheduledNotification({
      organizationId: user.organizationId,
      applicationId: app.applicationId,
      candidateId: cand.candidateId,
      requisitionId: cand.requisitionId,
      requisitionItemId: payload.requisition_item_id,
      interviewId: row.id,
      candidateName: cand.fullName,
      candidateEmail: cand.email,
      roundName: payload.round_name.trim(),
      roundType: payload.round_type,
      scheduledAt: row.scheduledAt.toISOString(),
      endTime: row.endTime.toISOString(),
      timezone: payload.timezone,
      meetingLink: payload.meeting_link?.trim() || null,
      interviewerLabel,
    });
    const interviewerTargets = await ivRepo.resolveInterviewerNotificationTargets(
      payload.interviewer_ids,
    );
    for (const interviewer of interviewerTargets) {
      // eslint-disable-next-line no-await-in-loop -- tiny interviewer list
      await enqueueInterviewScheduledInterviewerNotification({
        organizationId: user.organizationId,
        applicationId: app.applicationId,
        candidateId: cand.candidateId,
        requisitionId: cand.requisitionId,
        requisitionItemId: payload.requisition_item_id,
        interviewId: row.id,
        candidateName: cand.fullName,
        candidateEmail: cand.email,
        interviewerName: interviewer.username,
        interviewerEmail: interviewer.email,
        roundName: payload.round_name.trim(),
        roundType: payload.round_type,
        scheduledAt: row.scheduledAt.toISOString(),
        endTime: row.endTime.toISOString(),
        timezone: payload.timezone,
        meetingLink: payload.meeting_link?.trim() || null,
      });
    }
    await enqueueNotificationDeliveryJob();
  } catch {
    /* optional */
  }
}

/**
 * After interview patch: reschedule reminders, rescheduled email, cancel reminders if cancelled.
 */
export async function runSideEffectsAfterInterviewPatch(input: {
  user: ApiUser;
  updated: InterviewRow;
  timeChanged: boolean;
  newStatus: string | undefined;
  rescheduleReason: string | null;
}): Promise<void> {
  const { user, updated, timeChanged, newStatus, rescheduleReason } = input;
  if (newStatus && newStatus.toUpperCase() === "CANCELLED") {
    try {
      await removeInterviewReminderJobs(updated.id);
    } catch {
      /* optional */
    }
    return;
  }
  if (timeChanged) {
    try {
      await removeInterviewReminderJobs(updated.id);
    } catch {
      /* */
    }
    try {
      await scheduleInterviewReminderJobs({
        interviewId: updated.id,
        organizationId: user.organizationId,
        scheduledAt: updated.scheduledAt,
      });
    } catch {
      /* */
    }
  }
  if (!timeChanged) {
    return;
  }
  if (updated.requisitionItemId == null) {
    return;
  }
  const app = await ivRepo.findApplicationForSchedule({
    candidateId: updated.candidateId,
    requisitionItemId: updated.requisitionItemId,
    organizationId: user.organizationId,
  });
  if (!app) {
    return;
  }
  const full = await applicationsRepo.selectApplicationById(
    app.applicationId,
    user.organizationId,
  );
  if (!full) {
    return;
  }
  const c = full.candidate;
  try {
    await enqueueInterviewRescheduledNotification({
      organizationId: user.organizationId,
      applicationId: app.applicationId,
      candidateId: updated.candidateId,
      requisitionId: full.application.requisitionId,
      requisitionItemId: updated.requisitionItemId,
      interviewId: updated.id,
      candidateName: c.fullName,
      candidateEmail: c.email,
      roundName: updated.roundName ?? undefined,
      scheduledAt: updated.scheduledAt.toISOString(),
      endTime: updated.endTime.toISOString(),
      timezone: updated.timezone,
      meetingLink: updated.meetingLink,
      rescheduleReason,
      atMs: updated.scheduledAt.getTime(),
    });
    await enqueueNotificationDeliveryJob();
  } catch {
    /* */
  }
}
