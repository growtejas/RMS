CREATE TABLE "resume_parse_artifacts" (
	"resume_parse_artifact_id" serial PRIMARY KEY NOT NULL,
	"inbound_event_id" integer NOT NULL,
	"parser_provider" varchar(50) NOT NULL,
	"parser_version" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'processed' NOT NULL,
	"source_resume_ref" text,
	"raw_text" text,
	"parsed_data" jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_parse_artifacts" ADD CONSTRAINT "resume_parse_artifacts_inbound_event_id_inbound_events_inbound_event_id_fk" FOREIGN KEY ("inbound_event_id") REFERENCES "public"."inbound_events"("inbound_event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_resume_parse_artifacts_eventid" ON "resume_parse_artifacts" USING btree ("inbound_event_id");--> statement-breakpoint
CREATE INDEX "idx_resume_parse_artifacts_status" ON "resume_parse_artifacts" USING btree ("status");