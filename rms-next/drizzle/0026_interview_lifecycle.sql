-- Interview Lifecycle: link interviews to applications and prevent duplicate active rounds.
-- Additive only: keeps existing uppercase status (`SCHEDULED|COMPLETED|CANCELLED|NO_SHOW`)
-- and result (`PASS|FAIL|HOLD|NULL`) values intact.

ALTER TABLE "interviews"
  ADD COLUMN "application_id" integer
  REFERENCES "applications"("application_id") ON DELETE CASCADE;
--> statement-breakpoint

UPDATE "interviews" i
SET "application_id" = a."application_id"
FROM "applications" a
WHERE a."candidate_id" = i."candidate_id"
  AND (
    a."requisition_item_id" = i."requisition_item_id"
    OR (a."requisition_item_id" IS NULL AND i."requisition_item_id" IS NULL)
  );
--> statement-breakpoint

CREATE INDEX "idx_interviews_application_id"
  ON "interviews" ("application_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_interviews_app_round_active"
  ON "interviews" ("application_id", lower(trim("round_name")), "round_number")
  WHERE "status" <> 'CANCELLED'
    AND "round_name" IS NOT NULL
    AND "application_id" IS NOT NULL;
