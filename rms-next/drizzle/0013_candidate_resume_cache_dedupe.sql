ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "resume_content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "resume_parse_cache" jsonb;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "duplicate_resume_of_candidate_id" integer;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "candidates" ADD CONSTRAINT "candidates_duplicate_resume_of_candidate_id_candidates_candidate_id_fk" FOREIGN KEY ("duplicate_resume_of_candidate_id") REFERENCES "public"."candidates"("candidate_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_candidates_org_item_resume_hash" ON "candidates" USING btree ("organization_id","requisition_item_id","resume_content_hash");--> statement-breakpoint
