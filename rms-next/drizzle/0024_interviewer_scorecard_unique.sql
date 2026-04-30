-- One scorecard per panelist per interview (panelist_id NOT NULL).
-- Remove duplicates keeping the lowest id per (interview_id, panelist_id).
DELETE FROM "interview_scorecards" AS a
USING "interview_scorecards" AS b
WHERE a."panelist_id" IS NOT NULL
  AND b."panelist_id" IS NOT NULL
  AND a."interview_id" = b."interview_id"
  AND a."panelist_id" = b."panelist_id"
  AND a."id" > b."id";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_interview_scorecards_interview_panelist"
  ON "interview_scorecards" ("interview_id", "panelist_id")
  WHERE "panelist_id" IS NOT NULL;

INSERT INTO "roles" ("role_name") VALUES ('Interviewer')
ON CONFLICT ("role_name") DO NOTHING;
