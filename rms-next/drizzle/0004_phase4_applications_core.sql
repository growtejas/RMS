CREATE TABLE "application_stage_history" (
	"history_id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"from_stage" varchar(20),
	"to_stage" varchar(20) NOT NULL,
	"changed_by" integer,
	"reason" text,
	"metadata" jsonb,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"application_id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"requisition_item_id" integer NOT NULL,
	"requisition_id" integer NOT NULL,
	"current_stage" varchar(20) DEFAULT 'Sourced' NOT NULL,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_application_id_applications_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("application_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_candidate_id_candidates_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("candidate_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_changed_by_users_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("candidate_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_requisition_item_id_requisition_items_item_id_fk" FOREIGN KEY ("requisition_item_id") REFERENCES "public"."requisition_items"("item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_requisition_id_requisitions_req_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("req_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_application_stage_history_app_changedat" ON "application_stage_history" USING btree ("application_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_application_stage_history_candidate_changedat" ON "application_stage_history" USING btree ("candidate_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_applications_candidate" ON "applications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_applications_item_stage_createdat" ON "applications" USING btree ("requisition_item_id","current_stage","created_at");--> statement-breakpoint
CREATE INDEX "idx_applications_req_createdat" ON "applications" USING btree ("requisition_id","created_at");