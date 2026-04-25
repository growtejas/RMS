-- OAuth identities + access request onboarding flow.

DO $$ BEGIN
  CREATE TYPE "access_request_status" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "user_oauth_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" integer NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "provider" varchar(40) NOT NULL,
  "provider_sub" varchar(255) NOT NULL,
  "email" varchar(255) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_oauth_provider_sub"
  ON "user_oauth_identities" ("provider", "provider_sub");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_oauth_provider_email"
  ON "user_oauth_identities" ("provider", "email");

CREATE INDEX IF NOT EXISTS "idx_user_oauth_user_id"
  ON "user_oauth_identities" ("user_id");

CREATE TABLE IF NOT EXISTS "access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" integer NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "message" text,
  "status" "access_request_status" NOT NULL DEFAULT 'pending',
  "reviewed_by" integer REFERENCES "users"("user_id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_access_requests_user_id_created_at"
  ON "access_requests" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_access_requests_status_created_at"
  ON "access_requests" ("status", "created_at");

-- Prevent duplicate pending requests per user.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_access_requests_one_pending_per_user"
  ON "access_requests" ("user_id")
  WHERE "status" = 'pending';

