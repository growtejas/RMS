import { z } from "zod";

/** All lifecycle notification payloads require an idempotency key. */
const base = z.object({
  idempotency_key: z.string().min(1).max(200),
  organization_id: z.string().uuid(),
});

export const shortlistEventPayload = base.extend({
  event: z.literal("candidate.shortlisted"),
  application_id: z.number().int().positive(),
  candidate_id: z.number().int().positive(),
  requisition_id: z.number().int().positive(),
  requisition_item_id: z.number().int().positive(),
  candidate_name: z.string().min(1).max(200),
  candidate_email: z.string().email(),
  previous_stage: z.string().max(30),
});

export const interviewScheduledEventPayload = base.extend({
  event: z.literal("interview.scheduled"),
  interview_id: z.number().int().positive(),
  application_id: z.number().int().positive(),
  candidate_id: z.number().int().positive(),
  requisition_id: z.number().int().positive(),
  requisition_item_id: z.number().int().positive(),
  candidate_name: z.string().min(1).max(200),
  candidate_email: z.string().email(),
  round_name: z.string().max(150),
  round_type: z.string().max(50),
  scheduled_at: z.string(),
  end_time: z.string(),
  timezone: z.string().max(50),
  meeting_link: z.string().nullable().optional(),
  interviewer_label: z.string().max(300).optional(),
});

export const interviewRescheduledEventPayload = base.extend({
  event: z.literal("interview.rescheduled"),
  interview_id: z.number().int().positive(),
  application_id: z.number().int().positive(),
  candidate_id: z.number().int().positive(),
  requisition_id: z.number().int().positive(),
  requisition_item_id: z.number().int().positive(),
  candidate_name: z.string().min(1).max(200),
  candidate_email: z.string().email(),
  round_name: z.string().max(150).optional(),
  scheduled_at: z.string(),
  end_time: z.string(),
  timezone: z.string().max(50),
  meeting_link: z.string().nullable().optional(),
  reschedule_reason: z.string().max(500).nullable().optional(),
});

export const interviewScheduledInterviewerEventPayload = base.extend({
  event: z.literal("interview.scheduled.interviewer"),
  interview_id: z.number().int().positive(),
  application_id: z.number().int().positive(),
  candidate_id: z.number().int().positive(),
  requisition_id: z.number().int().positive(),
  requisition_item_id: z.number().int().positive(),
  candidate_name: z.string().min(1).max(200),
  candidate_email: z.string().email(),
  interviewer_name: z.string().min(1).max(200),
  interviewer_email: z.string().email(),
  round_name: z.string().max(150),
  round_type: z.string().max(50),
  scheduled_at: z.string(),
  end_time: z.string(),
  timezone: z.string().max(50),
  meeting_link: z.string().nullable().optional(),
});

export const interviewReminderEventPayload = base.extend({
  event: z.literal("interview.reminder"),
  reminder_kind: z.enum(["24h", "1h"]),
  interview_id: z.number().int().positive(),
  application_id: z.number().int().positive(),
  candidate_id: z.number().int().positive(),
  requisition_id: z.number().int().positive(),
  requisition_item_id: z.number().int().positive(),
  candidate_name: z.string().min(1).max(200),
  candidate_email: z.string().email(),
  scheduled_at: z.string(),
  round_name: z.string().max(150).optional(),
});

export const offerEventPayload = base.extend({
  event: z.literal("offer.status_changed"),
  application_id: z.number().int().positive(),
  candidate_id: z.number().int().positive(),
  candidate_name: z.string().min(1).max(200),
  candidate_email: z.string().email(),
  status: z.enum(["sent", "accepted", "declined", "expired", "revoked"]),
  note: z.string().max(500).optional(),
});

export const lifecycleEventPayload = z.discriminatedUnion("event", [
  shortlistEventPayload,
  interviewScheduledEventPayload,
  interviewRescheduledEventPayload,
  interviewScheduledInterviewerEventPayload,
  interviewReminderEventPayload,
  offerEventPayload,
]);

export type ShortlistEventPayload = z.infer<typeof shortlistEventPayload>;
export type InterviewScheduledEventPayload = z.infer<
  typeof interviewScheduledEventPayload
>;
export type InterviewRescheduledEventPayload = z.infer<
  typeof interviewRescheduledEventPayload
>;
export type InterviewScheduledInterviewerEventPayload = z.infer<
  typeof interviewScheduledInterviewerEventPayload
>;
export type InterviewReminderEventPayload = z.infer<
  typeof interviewReminderEventPayload
>;
export type OfferEventPayload = z.infer<typeof offerEventPayload>;

export const LIFECYCLE_EVENT_TYPES = [
  "candidate.shortlisted",
  "interview.scheduled",
  "interview.rescheduled",
  "interview.scheduled.interviewer",
  "interview.reminder",
  "offer.status_changed",
] as const;
