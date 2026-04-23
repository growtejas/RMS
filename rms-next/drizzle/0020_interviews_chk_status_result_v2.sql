-- Align interviews CHECK constraints with scheduling v2 (UPPER_SNAKE status/result).
-- Legacy DBs kept chk_interview_* from the original schema (Scheduled / Pass / …).

ALTER TABLE "interviews" DROP CONSTRAINT IF EXISTS "chk_interview_status";
ALTER TABLE "interviews" DROP CONSTRAINT IF EXISTS "chk_interview_result";

ALTER TABLE "interviews" ADD CONSTRAINT "chk_interview_status" CHECK (
  "status"::text IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
);

ALTER TABLE "interviews" ADD CONSTRAINT "chk_interview_result" CHECK (
  "result" IS NULL OR "result"::text IN ('PASS', 'FAIL', 'HOLD')
);
