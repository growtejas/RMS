-- Candidate Intelligence Engine (CIE): versioned parses, global reports, Q&A.
-- ATS columns on `candidates` remain source of truth; CIE stores derived intelligence only.

CREATE TABLE "candidate_parsed_data" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE restrict,
  "candidate_id" integer NOT NULL REFERENCES "candidates"("candidate_id") ON DELETE cascade,
  "parsed_json" jsonb NOT NULL,
  "version" integer NOT NULL,
  "source_resume_content_hash" varchar(64),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_candidate_parsed_data_candidate_version" UNIQUE ("candidate_id", "version")
);
--> statement-breakpoint
CREATE INDEX "idx_candidate_parsed_data_org_candidate"
  ON "candidate_parsed_data" ("organization_id", "candidate_id");
--> statement-breakpoint
CREATE INDEX "idx_candidate_parsed_data_candidate_version"
  ON "candidate_parsed_data" ("candidate_id", "version" DESC);
--> statement-breakpoint

CREATE TABLE "candidate_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE restrict,
  "candidate_id" integer NOT NULL REFERENCES "candidates"("candidate_id") ON DELETE cascade,
  "report_json" jsonb NOT NULL,
  "confidence_score" double precision NOT NULL,
  "model_version" varchar(80) NOT NULL,
  "ai_evaluated_at" timestamp DEFAULT now() NOT NULL,
  "processing_time_ms" integer DEFAULT 0 NOT NULL,
  "triggered_by" integer REFERENCES "users"("user_id") ON DELETE set null,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_candidate_reports_org_candidate"
  ON "candidate_reports" ("organization_id", "candidate_id");
--> statement-breakpoint
CREATE INDEX "idx_candidate_reports_candidate_evaluated"
  ON "candidate_reports" ("candidate_id", "ai_evaluated_at" DESC);
--> statement-breakpoint

CREATE TABLE "candidate_ai_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE restrict,
  "candidate_id" integer NOT NULL REFERENCES "candidates"("candidate_id") ON DELETE cascade,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "confidence" numeric(5, 4),
  "model_version" varchar(80),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_candidate_ai_conversations_org_candidate"
  ON "candidate_ai_conversations" ("organization_id", "candidate_id");
--> statement-breakpoint
CREATE INDEX "idx_candidate_ai_conversations_candidate_created"
  ON "candidate_ai_conversations" ("candidate_id", "created_at" DESC);
