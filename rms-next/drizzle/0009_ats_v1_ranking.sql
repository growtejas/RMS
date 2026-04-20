ALTER TABLE "requisition_items" ADD COLUMN IF NOT EXISTS "ranking_required_skills" jsonb;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "total_experience_years" numeric(5,2);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "notice_period_days" integer;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "is_referral" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "candidate_skills" jsonb;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_aliases" (
	"alias_id" serial PRIMARY KEY NOT NULL,
	"canonical_skill" varchar(100) NOT NULL,
	"alias" varchar(100) NOT NULL,
	CONSTRAINT "skill_aliases_alias_unique" UNIQUE("alias")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ranking_versions" (
	"ranking_version_id" serial PRIMARY KEY NOT NULL,
	"requisition_item_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_versions_requisition_item_id_requisition_items_item_id_fk" FOREIGN KEY ("requisition_item_id") REFERENCES "public"."requisition_items"("item_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "ranking_versions_item_version_unique" UNIQUE("requisition_item_id","version_number")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ranking_versions_item_active" ON "ranking_versions" USING btree ("requisition_item_id","is_active");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_job_scores" (
	"score_id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"requisition_item_id" integer NOT NULL,
	"ranking_version_id" integer NOT NULL,
	"score" numeric(5,2) NOT NULL,
	"breakdown" jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_job_scores_candidate_id_candidates_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("candidate_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "candidate_job_scores_item_fk" FOREIGN KEY ("requisition_item_id") REFERENCES "public"."requisition_items"("item_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "candidate_job_scores_version_fk" FOREIGN KEY ("ranking_version_id") REFERENCES "public"."ranking_versions"("ranking_version_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "candidate_job_scores_unique" UNIQUE("candidate_id","ranking_version_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_candidate_job_scores_item_score" ON "candidate_job_scores" USING btree ("requisition_item_id","score" DESC);--> statement-breakpoint
INSERT INTO "skill_aliases" ("canonical_skill", "alias") VALUES
	('JavaScript', 'javascript'), ('JavaScript', 'js'), ('TypeScript', 'typescript'), ('TypeScript', 'ts'),
	('Node.js', 'node'), ('Node.js', 'nodejs'), ('React', 'reactjs'), ('Python', 'python3'),
	('PostgreSQL', 'postgres'), ('PostgreSQL', 'postgresql'), ('AWS', 'amazon web services')
ON CONFLICT ("alias") DO NOTHING;
