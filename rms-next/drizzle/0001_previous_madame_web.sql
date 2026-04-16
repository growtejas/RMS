CREATE TABLE "inbound_events" (
	"inbound_event_id" serial PRIMARY KEY NOT NULL,
	"source" varchar(50) NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inbound_events_source_external" ON "inbound_events" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_events_status_receivedat" ON "inbound_events" USING btree ("status","received_at");