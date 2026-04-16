ALTER TABLE "candidates" ADD COLUMN "current_company" varchar(200);--> statement-breakpoint
ALTER TABLE "inbound_events" ADD COLUMN "dedupe_review" jsonb;