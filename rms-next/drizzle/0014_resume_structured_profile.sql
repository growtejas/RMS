-- Versioned structured resume profile (rules v2 + optional LLM refinement).
-- JSON shape validated in app code (Zod): see resume-structure.schema.ts

ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "resume_structured_profile" jsonb;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "resume_structure_status" varchar(20);

CREATE INDEX IF NOT EXISTS "idx_candidates_resume_structure_status"
  ON "candidates" ("resume_structure_status");
