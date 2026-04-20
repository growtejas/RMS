-- Phase 1: tenant scoping + membership
-- `organizations` must exist before the seed INSERT (earlier numbered migrations did not create it).
DO $$ BEGIN
  CREATE TYPE "public"."subscription_plan" AS ENUM ('free', 'pro', 'enterprise');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "name" varchar(120) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "logo_url" text,
  "domain" varchar(120),
  "settings" jsonb,
  "google_oauth_tokens" jsonb,
  "subscription_plan" "public"."subscription_plan" NOT NULL DEFAULT 'free',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);

INSERT INTO "organizations" ("id", "name", "slug", "subscription_plan", "created_at", "updated_at")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Default organization',
  'default',
  'free',
  now(),
  now()
)
ON CONFLICT ("slug") DO NOTHING;

CREATE TABLE IF NOT EXISTS "organization_members" (
  "user_id" integer NOT NULL,
  "organization_id" uuid NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  CONSTRAINT "organization_members_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "organization_members_user_id_organization_id_pk" PRIMARY KEY("user_id","organization_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_members_one_primary_per_user"
  ON "organization_members" ("user_id") WHERE "is_primary" = true;

INSERT INTO "organization_members" ("user_id", "organization_id", "is_primary")
SELECT "u"."user_id", "o"."id", true
FROM "users" "u"
CROSS JOIN (SELECT "id" FROM "organizations" WHERE "slug" = 'default' LIMIT 1) "o"
ON CONFLICT ("user_id", "organization_id") DO NOTHING;

ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
UPDATE "requisitions" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default' LIMIT 1) WHERE "organization_id" IS NULL;
ALTER TABLE "requisitions" ALTER COLUMN "organization_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_requisitions_organization_reqid_desc" ON "requisitions" ("organization_id", "req_id" DESC);

ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
UPDATE "candidates" c SET "organization_id" = r."organization_id" FROM "requisitions" r WHERE c."requisition_id" = r."req_id" AND c."organization_id" IS NULL;
UPDATE "candidates" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default' LIMIT 1) WHERE "organization_id" IS NULL;
ALTER TABLE "candidates" ALTER COLUMN "organization_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "candidates" ADD CONSTRAINT "candidates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_candidates_org_item" ON "candidates" ("organization_id", "requisition_item_id");

ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
UPDATE "applications" a SET "organization_id" = r."organization_id" FROM "requisitions" r WHERE a."requisition_id" = r."req_id" AND a."organization_id" IS NULL;
UPDATE "applications" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default' LIMIT 1) WHERE "organization_id" IS NULL;
ALTER TABLE "applications" ALTER COLUMN "organization_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "applications" ADD CONSTRAINT "applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_applications_org_item" ON "applications" ("organization_id", "requisition_item_id");

ALTER TABLE "inbound_events" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
UPDATE "inbound_events" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default' LIMIT 1) WHERE "organization_id" IS NULL;
ALTER TABLE "inbound_events" ALTER COLUMN "organization_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "inbound_events" ADD CONSTRAINT "inbound_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Phase 2: pipeline labels + automation rules (config per org)
CREATE TABLE IF NOT EXISTS "pipeline_stage_definitions" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL,
  "stage_key" varchar(40) NOT NULL,
  "label" varchar(120) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_terminal" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pipeline_stage_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "pipeline_stage_definitions_org_stage_unique" UNIQUE("organization_id","stage_key")
);

CREATE TABLE IF NOT EXISTS "ats_automation_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" varchar(120) NOT NULL,
  "trigger" varchar(80) NOT NULL,
  "config" jsonb DEFAULT '{}' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ats_automation_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "idx_ats_automation_rules_org_active" ON "ats_automation_rules" ("organization_id", "is_active");

-- Phase 3: interviews expansion
CREATE TABLE IF NOT EXISTS "interview_panelists" (
  "id" serial PRIMARY KEY NOT NULL,
  "interview_id" integer NOT NULL,
  "user_id" integer,
  "display_name" varchar(150) NOT NULL,
  "role_label" varchar(80),
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "interview_panelists_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "interview_panelists_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "idx_interview_panelists_interview" ON "interview_panelists" ("interview_id");

CREATE TABLE IF NOT EXISTS "interview_scorecards" (
  "id" serial PRIMARY KEY NOT NULL,
  "interview_id" integer NOT NULL,
  "panelist_id" integer,
  "scores" jsonb DEFAULT '{}' NOT NULL,
  "notes" text,
  "submitted_by" integer,
  "submitted_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "interview_scorecards_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "interview_scorecards_panelist_id_interview_panelists_id_fk" FOREIGN KEY ("panelist_id") REFERENCES "public"."interview_panelists"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "interview_scorecards_submitted_by_users_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "idx_interview_scorecards_interview" ON "interview_scorecards" ("interview_id");

-- Phase 4: bulk operations tracking
CREATE TABLE IF NOT EXISTS "bulk_import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "kind" varchar(40) NOT NULL,
  "status" varchar(20) DEFAULT 'queued' NOT NULL,
  "payload" jsonb,
  "result_summary" jsonb,
  "error_message" text,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "bulk_import_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "bulk_import_jobs_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "idx_bulk_import_jobs_org_status" ON "bulk_import_jobs" ("organization_id", "status", "created_at" DESC);

-- Phase 5: notifications + candidate portal tokens
CREATE TABLE IF NOT EXISTS "notification_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" uuid,
  "event_type" varchar(80) NOT NULL,
  "payload" jsonb NOT NULL,
  "channel" varchar(20) DEFAULT 'email' NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "notification_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "idx_notification_events_org_status" ON "notification_events" ("organization_id", "status", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "candidate_portal_tokens" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "application_id" integer NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "candidate_portal_tokens_application_id_applications_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("application_id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "idx_candidate_portal_tokens_app" ON "candidate_portal_tokens" ("application_id");

-- Optional RLS hook: uncomment after setting app.current_org_id per session if using database roles.
-- ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY requisitions_tenant_isolation ON requisitions USING (organization_id::text = current_setting('app.current_org_id', true));
