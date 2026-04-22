-- Permanent requisition line CV upload storage.
-- Used to enforce "CV must be on file for this position before shortlisting".

ALTER TABLE "requisition_items"
  ADD COLUMN IF NOT EXISTS "cv_file_key" text;

ALTER TABLE "requisition_items"
  ADD COLUMN IF NOT EXISTS "cv_file_name" text;

