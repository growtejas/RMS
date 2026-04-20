ALTER TABLE "requisition_items" ADD COLUMN "pipeline_ranking_use_requisition_jd" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "requisition_items" ADD COLUMN "pipeline_jd_text" text;--> statement-breakpoint
ALTER TABLE "requisition_items" ADD COLUMN "pipeline_jd_file_key" text;
