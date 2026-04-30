ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255);

-- Backfill: legacy rows where username is already an email.
UPDATE "users"
SET "email" = lower(trim("username"))
WHERE "email" IS NULL
  AND position('@' in "username") > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ux_users_email'
  ) THEN
    CREATE UNIQUE INDEX "ux_users_email" ON "users" ("email");
  END IF;
END
$$;

