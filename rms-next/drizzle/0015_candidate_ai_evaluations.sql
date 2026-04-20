CREATE TABLE "candidate_ai_evaluations" (
  "evaluation_id" serial PRIMARY KEY,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE restrict,
  "requisition_item_id" integer NOT NULL REFERENCES "requisition_items"("item_id") ON DELETE cascade,
  "candidate_id" integer NOT NULL REFERENCES "candidates"("candidate_id") ON DELETE cascade,
  "input_hash" varchar(64) NOT NULL,
  "model" varchar(80) NOT NULL,
  "prompt_version" varchar(40) NOT NULL,
  "ai_score" numeric(6, 2) NOT NULL,
  "breakdown" jsonb NOT NULL,
  "summary" text NOT NULL,
  "risks" jsonb NOT NULL,
  "confidence" numeric(5, 4) NOT NULL,
  "raw_error" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "uq_candidate_ai_eval_item_candidate_hash"
  ON "candidate_ai_evaluations" ("requisition_item_id", "candidate_id", "input_hash");

CREATE INDEX "idx_candidate_ai_eval_org_item"
  ON "candidate_ai_evaluations" ("organization_id", "requisition_item_id");

CREATE INDEX "idx_candidate_ai_eval_candidate"
  ON "candidate_ai_evaluations" ("candidate_id");
