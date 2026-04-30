/**
 * Delivers `notification_events` with status `pending` → `sent` | `failed`.
 *
 * Inserts: service layer (see `lifecycle-notifications` — shortlist, interview, reminders,
 * offer) and `POST /api/notifications/events` for manual tests. `payload.idempotency_key`
 * dedupes pending+sent in `findExistingLifecycleEventByIdempotencyKey`.
 * Processing: `npm run worker:notification-delivery` runs BullMQ job → `processPendingNotificationBatch` here;
 * each enqueue also tries `enqueueNotificationDeliveryJob()` and **`processNotificationEventId`**
 * on the new row (so email sends without Redis/worker). The worker is still useful for retries/backlog.
 */
import { lifecycleEventPayload } from "@/lib/notifications/lifecycle-event-types";
import { sendOutboundEmail } from "@/lib/email/email-transport";
import {
  markNotificationEventFailed,
  markNotificationEventSent,
} from "@/lib/repositories/notification-events-repo";
import { notificationEvents } from "@/lib/db/schema";
import type { InferSelectModel } from "drizzle-orm";

type Row = InferSelectModel<typeof notificationEvents>;

function buildEmailFromPayload(
  parsed: ReturnType<typeof lifecycleEventPayload.parse>,
  eventType: string,
): { to: string; subject: string; text: string; tags: string[] } {
  const tags = [eventType, parsed.event];
  switch (parsed.event) {
    case "candidate.shortlisted": {
      return {
        to: parsed.candidate_email,
        subject: `Shortlisted: ${parsed.candidate_name}`,
        text: `Hello ${parsed.candidate_name},

You have been shortlisted for a position (application #${parsed.application_id}).

We will be in touch with next steps.

— Hiring team`,
        tags,
      };
    }
    case "interview.scheduled": {
      return {
        to: parsed.candidate_email,
        subject: `Interview scheduled: ${parsed.round_name}`,
        text: `Hello ${parsed.candidate_name},

An interview has been scheduled.

Round: ${parsed.round_name} (${parsed.round_type})
Time: ${parsed.scheduled_at} – ${parsed.end_time} (${parsed.timezone})
${parsed.interviewer_label ? `Interviewers: ${parsed.interviewer_label}\n` : ""}${parsed.meeting_link ? `Meeting link: ${parsed.meeting_link}\n` : ""}
— Hiring team`,
        tags,
      };
    }
    case "interview.rescheduled": {
      return {
        to: parsed.candidate_email,
        subject: `Interview rescheduled${parsed.round_name ? `: ${parsed.round_name}` : ""}`,
        text: `Hello ${parsed.candidate_name},

Your interview was rescheduled.

Time: ${parsed.scheduled_at} – ${parsed.end_time} (${parsed.timezone})
${parsed.meeting_link ? `Meeting link: ${parsed.meeting_link}\n` : ""}${
          parsed.reschedule_reason
            ? `Note: ${parsed.reschedule_reason}\n`
            : ""
        }
— Hiring team`,
        tags,
      };
    }
    case "interview.scheduled.interviewer": {
      return {
        to: parsed.interviewer_email,
        subject: `Interview panel schedule: ${parsed.round_name}`,
        text: `Hello ${parsed.interviewer_name},

You have been assigned as an interviewer.

Candidate: ${parsed.candidate_name} (${parsed.candidate_email})
Round: ${parsed.round_name} (${parsed.round_type})
Time: ${parsed.scheduled_at} – ${parsed.end_time} (${parsed.timezone})
${parsed.meeting_link ? `Meeting link: ${parsed.meeting_link}\n` : ""}
— Hiring team`,
        tags,
      };
    }
    case "interview.reminder": {
      return {
        to: parsed.candidate_email,
        subject:
          parsed.reminder_kind === "24h"
            ? "Reminder: interview in 24 hours"
            : "Reminder: interview in 1 hour",
        text: `Hello ${parsed.candidate_name},

This is a ${parsed.reminder_kind === "24h" ? "24-hour" : "1-hour"} reminder for your interview.

${parsed.round_name ? `Round: ${parsed.round_name}\n` : ""}Scheduled: ${parsed.scheduled_at}

— Hiring team`,
        tags,
      };
    }
    case "offer.status_changed": {
      return {
        to: parsed.candidate_email,
        subject: `Offer update: ${parsed.status}`,
        text: `Hello ${parsed.candidate_name},

There is an update regarding your offer for application #${parsed.application_id}.

Status: ${parsed.status}
${parsed.note ? `Note: ${parsed.note}\n` : ""}
— HR`,
        tags,
      };
    }
    default: {
      const _exhaustive: never = parsed;
      return _exhaustive;
    }
  }
}

/**
 * Delivers a single pending email row (e.g. right after insert when no background worker is running).
 * Returns true if the row was processed.
 */
export async function processNotificationEventId(id: number): Promise<boolean> {
  const { selectNotificationEventById } = await import(
    "@/lib/repositories/notification-events-repo"
  );
  const row = await selectNotificationEventById(id);
  if (!row) {
    return false;
  }
  if (row.status !== "pending" || row.channel !== "email") {
    return false;
  }
  await processNotificationEventRow(row);
  return true;
}

export async function processNotificationEventRow(row: Row) {
  const raw = row.payload;
  if (!raw || typeof raw !== "object") {
    await markNotificationEventFailed(row.id, "Invalid payload (not an object)");
    return;
  }
  const parsed = lifecycleEventPayload.safeParse(raw);
  if (!parsed.success) {
    await markNotificationEventFailed(
      row.id,
      `Invalid lifecycle payload: ${parsed.error.message}`,
    );
    return;
  }
  const data = parsed.data;
  try {
    const mail = buildEmailFromPayload(
      data,
      row.eventType,
    );
    await sendOutboundEmail({
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      tags: mail.tags,
    });
    await markNotificationEventSent(row.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markNotificationEventFailed(row.id, msg);
  }
}

export async function processPendingNotificationBatch() {
  const { listPendingNotificationEvents } = await import(
    "@/lib/repositories/notification-events-repo"
  );
  const rows = await listPendingNotificationEvents(40);
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop -- small batch, sequential is fine
    await processNotificationEventRow(r);
  }
  return rows.length;
}
