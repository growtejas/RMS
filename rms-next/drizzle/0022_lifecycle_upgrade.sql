-- Lifecycle notifications + optional Google Calendar + application offer metadata
ALTER TABLE "notification_events" ADD COLUMN IF NOT EXISTS "error_message" text;
ALTER TABLE "notification_events" ADD COLUMN IF NOT EXISTS "sent_at" timestamp;

ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "offer_meta" jsonb;

ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "google_calendar_event_id" varchar(120);
