-- Global person pool: one row per org + normalized email; candidates link via person_id.
-- Backfill: one person per existing candidate (1:1); new inserts merge by email within org.

CREATE TABLE IF NOT EXISTS "candidate_persons" (
  "person_id" serial PRIMARY KEY,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "email_normalized" varchar(255) NOT NULL,
  "full_name" varchar(150) NOT NULL,
  "phone" varchar(30),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_candidate_persons_org_email"
  ON "candidate_persons" ("organization_id", "email_normalized");

CREATE INDEX IF NOT EXISTS "idx_candidate_persons_org"
  ON "candidate_persons" ("organization_id");

ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "person_id" integer
  REFERENCES "candidate_persons"("person_id") ON DELETE RESTRICT;

DO $$
DECLARE r RECORD;
DECLARE new_pid int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM candidates WHERE person_id IS NULL LIMIT 1
  ) THEN
    FOR r IN
      SELECT candidate_id, organization_id, lower(trim(email)) AS en, full_name, phone
      FROM candidates
      WHERE person_id IS NULL
      ORDER BY candidate_id
    LOOP
      INSERT INTO candidate_persons (organization_id, email_normalized, full_name, phone)
      VALUES (r.organization_id, r.en, r.full_name, r.phone)
      RETURNING person_id INTO new_pid;
      UPDATE candidates SET person_id = new_pid WHERE candidate_id = r.candidate_id;
    END LOOP;
  END IF;
END $$;

ALTER TABLE "candidates" ALTER COLUMN "person_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_candidates_org_item_person"
  ON "candidates" ("organization_id", "requisition_item_id", "person_id");
