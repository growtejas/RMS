ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "ats_bucket" varchar(30);

CREATE INDEX IF NOT EXISTS "idx_applications_org_item_ats_bucket"
  ON "applications" ("organization_id", "requisition_item_id", "ats_bucket");
