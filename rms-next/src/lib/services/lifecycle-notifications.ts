import { enqueueNotificationDeliveryJob } from "@/lib/queue/notification-delivery-queue";
import {
  findExistingLifecycleEventByIdempotencyKey,
  insertNotificationEvent,
} from "@/lib/repositories/notification-events-repo";
import type { z } from "zod";
import { lifecycleEventPayload } from "@/lib/notifications/lifecycle-event-types";

type Payload = z.infer<typeof lifecycleEventPayload> & { idempotency_key: string };

function isDisabled() {
  return process.env.LIFECYCLE_NOTIFICATIONS === "0";
}

export async function enqueueLifecycleEmail(params: {
  organizationId: string;
  eventType: string;
  payload: Payload;
}) {
  if (isDisabled()) {
    return { skipped: true as const, id: null as number | null };
  }
  const existing = await findExistingLifecycleEventByIdempotencyKey({
    organizationId: params.organizationId,
    idempotencyKey: params.payload.idempotency_key,
  });
  if (existing) {
    return { skipped: true as const, id: existing.id };
  }
  const id = await insertNotificationEvent({
    organizationId: params.organizationId,
    eventType: params.eventType,
    payload: params.payload as Record<string, unknown>,
    channel: "email",
  });
  if (id != null) {
    try {
      await enqueueNotificationDeliveryJob();
    } catch {
      /* redis optional: delivery can be run by separate poller */
    }
    try {
      const { processNotificationEventId } = await import(
        "@/lib/services/notification-delivery-service"
      );
      await processNotificationEventId(id);
    } catch (e) {
      // eslint-disable-next-line no-console -- surface SMTP/config failures in dev
      console.error("[lifecycle-email] failed to deliver notification", id, e);
    }
  }
  return { skipped: false as const, id };
}

export async function enqueueShortlistedNotification(input: {
  organizationId: string;
  applicationId: number;
  candidateId: number;
  requisitionId: number;
  requisitionItemId: number;
  candidateName: string;
  candidateEmail: string;
  previousStage: string;
}) {
  return enqueueLifecycleEmail({
    organizationId: input.organizationId,
    eventType: "candidate.shortlisted",
    payload: {
      idempotency_key: `shortlist:application:${input.applicationId}`,
      organization_id: input.organizationId,
      event: "candidate.shortlisted",
      application_id: input.applicationId,
      candidate_id: input.candidateId,
      requisition_id: input.requisitionId,
      requisition_item_id: input.requisitionItemId,
      candidate_name: input.candidateName,
      candidate_email: input.candidateEmail,
      previous_stage: input.previousStage,
    },
  });
}

/** Same as transition-time shortlist email but unique idempotency so each “Send email” can deliver. */
export async function enqueueShortlistedEmailManual(input: {
  organizationId: string;
  applicationId: number;
  candidateId: number;
  requisitionId: number;
  requisitionItemId: number;
  candidateName: string;
  candidateEmail: string;
  previousStage: string;
}) {
  return enqueueLifecycleEmail({
    organizationId: input.organizationId,
    eventType: "candidate.shortlisted",
    payload: {
      idempotency_key: `shortlist:application:${input.applicationId}:m:${Date.now()}-${Math.random().toString(16).slice(2)}`,
      organization_id: input.organizationId,
      event: "candidate.shortlisted",
      application_id: input.applicationId,
      candidate_id: input.candidateId,
      requisition_id: input.requisitionId,
      requisition_item_id: input.requisitionItemId,
      candidate_name: input.candidateName,
      candidate_email: input.candidateEmail,
      previous_stage: input.previousStage,
    },
  });
}

export async function enqueueInterviewScheduledNotification(input: {
  organizationId: string;
  applicationId: number;
  candidateId: number;
  requisitionId: number;
  requisitionItemId: number;
  interviewId: number;
  candidateName: string;
  candidateEmail: string;
  roundName: string;
  roundType: string;
  scheduledAt: string;
  endTime: string;
  timezone: string;
  meetingLink: string | null;
  interviewerLabel?: string;
}) {
  return enqueueLifecycleEmail({
    organizationId: input.organizationId,
    eventType: "interview.scheduled",
    payload: {
      idempotency_key: `interview:scheduled:${input.interviewId}`,
      organization_id: input.organizationId,
      event: "interview.scheduled",
      interview_id: input.interviewId,
      application_id: input.applicationId,
      candidate_id: input.candidateId,
      requisition_id: input.requisitionId,
      requisition_item_id: input.requisitionItemId,
      candidate_name: input.candidateName,
      candidate_email: input.candidateEmail,
      round_name: input.roundName,
      round_type: input.roundType,
      scheduled_at: input.scheduledAt,
      end_time: input.endTime,
      timezone: input.timezone,
      meeting_link: input.meetingLink,
      interviewer_label: input.interviewerLabel,
    },
  });
}

export async function enqueueInterviewScheduledInterviewerNotification(input: {
  organizationId: string;
  applicationId: number;
  candidateId: number;
  requisitionId: number;
  requisitionItemId: number;
  interviewId: number;
  candidateName: string;
  candidateEmail: string;
  interviewerName: string;
  interviewerEmail: string;
  roundName: string;
  roundType: string;
  scheduledAt: string;
  endTime: string;
  timezone: string;
  meetingLink: string | null;
}) {
  return enqueueLifecycleEmail({
    organizationId: input.organizationId,
    eventType: "interview.scheduled.interviewer",
    payload: {
      idempotency_key: `interview:scheduled:interviewer:${input.interviewId}:${input.interviewerEmail.toLowerCase()}`,
      organization_id: input.organizationId,
      event: "interview.scheduled.interviewer",
      interview_id: input.interviewId,
      application_id: input.applicationId,
      candidate_id: input.candidateId,
      requisition_id: input.requisitionId,
      requisition_item_id: input.requisitionItemId,
      candidate_name: input.candidateName,
      candidate_email: input.candidateEmail,
      interviewer_name: input.interviewerName,
      interviewer_email: input.interviewerEmail,
      round_name: input.roundName,
      round_type: input.roundType,
      scheduled_at: input.scheduledAt,
      end_time: input.endTime,
      timezone: input.timezone,
      meeting_link: input.meetingLink,
    },
  });
}

export async function enqueueInterviewRescheduledNotification(input: {
  organizationId: string;
  applicationId: number;
  candidateId: number;
  requisitionId: number;
  requisitionItemId: number;
  interviewId: number;
  candidateName: string;
  candidateEmail: string;
  roundName?: string;
  scheduledAt: string;
  endTime: string;
  timezone: string;
  meetingLink: string | null;
  rescheduleReason: string | null;
  atMs: number;
}) {
  return enqueueLifecycleEmail({
    organizationId: input.organizationId,
    eventType: "interview.rescheduled",
    payload: {
      idempotency_key: `interview:rescheduled:${input.interviewId}:${input.atMs}`,
      organization_id: input.organizationId,
      event: "interview.rescheduled",
      interview_id: input.interviewId,
      application_id: input.applicationId,
      candidate_id: input.candidateId,
      requisition_id: input.requisitionId,
      requisition_item_id: input.requisitionItemId,
      candidate_name: input.candidateName,
      candidate_email: input.candidateEmail,
      round_name: input.roundName,
      scheduled_at: input.scheduledAt,
      end_time: input.endTime,
      timezone: input.timezone,
      meeting_link: input.meetingLink,
      reschedule_reason: input.rescheduleReason,
    },
  });
}

export async function enqueueInterviewReminderNotification(input: {
  organizationId: string;
  applicationId: number;
  candidateId: number;
  requisitionId: number;
  requisitionItemId: number;
  interviewId: number;
  candidateName: string;
  candidateEmail: string;
  roundName: string | null;
  scheduledAt: string;
  kind: "24h" | "1h";
}) {
  return enqueueLifecycleEmail({
    organizationId: input.organizationId,
    eventType: "interview.reminder",
    payload: {
      idempotency_key: `interview:reminder:${input.interviewId}:${input.kind}`,
      organization_id: input.organizationId,
      event: "interview.reminder",
      reminder_kind: input.kind,
      interview_id: input.interviewId,
      application_id: input.applicationId,
      candidate_id: input.candidateId,
      requisition_id: input.requisitionId,
      requisition_item_id: input.requisitionItemId,
      candidate_name: input.candidateName,
      candidate_email: input.candidateEmail,
      scheduled_at: input.scheduledAt,
      round_name: input.roundName ?? undefined,
    },
  });
}

const OFFER_STATUSES = new Set([
  "sent",
  "accepted",
  "declined",
  "expired",
  "revoked",
]);

export async function maybeEnqueueOfferStatusNotification(input: {
  organizationId: string;
  applicationId: number;
  candidateId: number;
  candidateName: string;
  candidateEmail: string;
  offerMeta: Record<string, unknown> | null;
}): Promise<void> {
  if (!input.offerMeta) {
    return;
  }
  const raw = input.offerMeta.status;
  if (typeof raw !== "string" || !OFFER_STATUSES.has(raw)) {
    return;
  }
  const status = raw as
    | "sent"
    | "accepted"
    | "declined"
    | "expired"
    | "revoked";
  const note =
    typeof input.offerMeta.note === "string"
      ? input.offerMeta.note
      : undefined;
  try {
    await enqueueLifecycleEmail({
      organizationId: input.organizationId,
      eventType: "offer.status_changed",
      payload: {
        idempotency_key: `offer:application:${input.applicationId}:status:${status}`,
        organization_id: input.organizationId,
        event: "offer.status_changed",
        application_id: input.applicationId,
        candidate_id: input.candidateId,
        candidate_name: input.candidateName,
        candidate_email: input.candidateEmail,
        status,
        ...(note != null && note.length > 0 ? { note: note.slice(0, 500) } : {}),
      },
    });
    try {
      await enqueueNotificationDeliveryJob();
    } catch {
      /* redis optional */
    }
  } catch {
    /* ignore */
  }
}
