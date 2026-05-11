-- 0030 analytics dynamic stages + composite indexes for analytics filtering
-- Adds dynamic-stage metadata (Track 2.1) and analytics-focused composite
-- indexes (Track 3.3). Phase 2 snapshot/aggregation tables continue to live
-- as scaffolding only.

-- 1. dynamic stage metadata
ALTER TABLE pipeline_stage_definitions
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE pipeline_stage_definitions
  ADD COLUMN IF NOT EXISTS archived_at timestamp;
ALTER TABLE pipeline_stage_definitions
  ADD COLUMN IF NOT EXISTS stage_type varchar(20) NOT NULL DEFAULT 'active';

-- Helpful sort/visibility lookup (used by every report).
CREATE INDEX IF NOT EXISTS idx_pipeline_stage_definitions_org_sort
  ON pipeline_stage_definitions (organization_id, sort_order);

-- 2. Analytics composite indexes targeting the report filter shape:
--    organization_id + created_at range + (current_stage | source | recruiter | requisition).
CREATE INDEX IF NOT EXISTS idx_applications_org_created_stage
  ON applications (organization_id, created_at DESC, current_stage);

CREATE INDEX IF NOT EXISTS idx_applications_org_created_source
  ON applications (organization_id, created_at DESC, source);

CREATE INDEX IF NOT EXISTS idx_applications_org_created_recruiter
  ON applications (organization_id, created_at DESC, created_by);

CREATE INDEX IF NOT EXISTS idx_applications_org_requisition_created
  ON applications (organization_id, requisition_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_org_item_created
  ON applications (organization_id, requisition_item_id, created_at DESC);

-- Stage transitions: lookups by application + chronological order are
-- the dominant analytics access pattern.
CREATE INDEX IF NOT EXISTS idx_application_stage_history_app_changed
  ON application_stage_history (application_id, changed_at DESC);

-- Interview analytics: organization_id is implicit via join, so we focus
-- on application_id, scheduled_at and conducted_by which drive recruiter
-- and interviewer analytics.
CREATE INDEX IF NOT EXISTS idx_interviews_app_scheduled
  ON interviews (application_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_interviews_conducted_by_scheduled
  ON interviews (conducted_by, scheduled_at DESC);

-- Scorecards: pull by interview_id for feedback turnaround analytics.
CREATE INDEX IF NOT EXISTS idx_interview_scorecards_interview_submitted
  ON interview_scorecards (interview_id, submitted_at DESC);
