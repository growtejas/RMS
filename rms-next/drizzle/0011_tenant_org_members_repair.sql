-- Idempotent repair: ensures `organizations` + `organization_members` exist.
-- Use when `0010` was recorded as applied but these tables are missing, or before `0010` was fixed.
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
