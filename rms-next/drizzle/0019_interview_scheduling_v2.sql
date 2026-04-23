-- Interview scheduling v2: requisition-scoped rounds, overlap detection, reschedule audit.
-- Normalizes status/result to UPPER_SNAKE; backfills end_time and timezone.

ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "requisition_item_id" integer;
DO $$ BEGIN
  ALTER TABLE "interviews"
    ADD CONSTRAINT "interviews_requisition_item_id_requisition_items_item_id_fk"
    FOREIGN KEY ("requisition_item_id") REFERENCES "requisition_items"("item_id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "round_name" varchar(100);
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "round_type" varchar(50);
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "interview_mode" varchar(20);
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "end_time" timestamp;
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "timezone" varchar(50) DEFAULT 'UTC';
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "meeting_link" text;
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "created_by" integer;
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "updated_by" integer;

DO $$ BEGIN
  ALTER TABLE "interviews"
    ADD CONSTRAINT "interviews_created_by_users_user_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "interviews"
    ADD CONSTRAINT "interviews_updated_by_users_user_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "interviews" SET "end_time" = "scheduled_at" + interval '1 hour' WHERE "end_time" IS NULL;
ALTER TABLE "interviews" ALTER COLUMN "end_time" SET NOT NULL;

UPDATE "interviews" SET "timezone" = 'UTC' WHERE "timezone" IS NULL;
ALTER TABLE "interviews" ALTER COLUMN "timezone" SET NOT NULL;
ALTER TABLE "interviews" ALTER COLUMN "timezone" SET DEFAULT 'UTC';

UPDATE "interviews" SET "status" = 'SCHEDULED' WHERE "status" = 'Scheduled';
UPDATE "interviews" SET "status" = 'COMPLETED' WHERE "status" = 'Completed';
UPDATE "interviews" SET "status" = 'CANCELLED' WHERE "status" = 'Cancelled';

UPDATE "interviews" SET "result" = 'PASS' WHERE "result" = 'Pass';
UPDATE "interviews" SET "result" = 'FAIL' WHERE "result" = 'Fail';
UPDATE "interviews" SET "result" = 'HOLD' WHERE "result" = 'Hold';

ALTER TABLE "interviews" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';

ALTER TABLE "interviews" ALTER COLUMN "interviewer_name" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "interview_reschedules" (
  "id" serial PRIMARY KEY NOT NULL,
  "interview_id" integer NOT NULL,
  "old_scheduled_at" timestamp,
  "new_scheduled_at" timestamp,
  "old_end_time" timestamp,
  "new_end_time" timestamp,
  "changed_by" integer,
  "reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "interview_reschedules"
    ADD CONSTRAINT "interview_reschedules_interview_id_interviews_id_fk"
    FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "interview_reschedules"
    ADD CONSTRAINT "interview_reschedules_changed_by_users_user_id_fk"
    FOREIGN KEY ("changed_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_interview_reschedules_interview" ON "interview_reschedules" ("interview_id");
CREATE INDEX IF NOT EXISTS "idx_interviews_sched_end" ON "interviews" ("scheduled_at", "end_time");
CREATE INDEX IF NOT EXISTS "idx_interviews_req_item_sched" ON "interviews" ("requisition_item_id", "scheduled_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_interviews_active_round_name"
ON "interviews" ("candidate_id", "requisition_item_id", lower(trim("round_name")))
WHERE "status" NOT IN ('CANCELLED', 'Cancelled')
  AND "requisition_item_id" IS NOT NULL
  AND "round_name" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_interview_panelists_interview_user"
ON "interview_panelists" ("interview_id", "user_id")
WHERE "user_id" IS NOT NULL;
