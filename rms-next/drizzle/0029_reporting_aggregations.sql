CREATE TABLE IF NOT EXISTS daily_pipeline_metrics (
  id SERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  stage_key VARCHAR(40) NOT NULL,
  applications_count INTEGER NOT NULL DEFAULT 0,
  interviews_count INTEGER NOT NULL DEFAULT 0,
  hires_count INTEGER NOT NULL DEFAULT 0,
  dropoff_count INTEGER NOT NULL DEFAULT 0,
  avg_time_in_stage_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, metric_date, stage_key)
);

CREATE TABLE IF NOT EXISTS daily_interview_metrics (
  id SERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  interview_stage VARCHAR(80) NOT NULL,
  scheduled_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  avg_feedback_turnaround_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, metric_date, interview_stage)
);

CREATE TABLE IF NOT EXISTS recruiter_performance_metrics (
  id SERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  recruiter_id INTEGER,
  candidates_processed INTEGER NOT NULL DEFAULT 0,
  hires_made INTEGER NOT NULL DEFAULT 0,
  conversion_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
  avg_response_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  active_requisitions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, metric_date, recruiter_id)
);

CREATE TABLE IF NOT EXISTS source_performance_metrics (
  id SERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  source VARCHAR(100) NOT NULL,
  applications_count INTEGER NOT NULL DEFAULT 0,
  interviews_count INTEGER NOT NULL DEFAULT 0,
  hires_count INTEGER NOT NULL DEFAULT 0,
  quality_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  conversion_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, metric_date, source)
);

CREATE TABLE IF NOT EXISTS report_snapshots (
  id SERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  snapshot_key VARCHAR(200) NOT NULL,
  payload JSONB NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  UNIQUE (organization_id, snapshot_key)
);

CREATE INDEX IF NOT EXISTS idx_daily_pipeline_metrics_org_date
  ON daily_pipeline_metrics (organization_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_interview_metrics_org_date
  ON daily_interview_metrics (organization_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_recruiter_perf_metrics_org_date
  ON recruiter_performance_metrics (organization_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_source_perf_metrics_org_date
  ON source_performance_metrics (organization_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_org_key
  ON report_snapshots (organization_id, snapshot_key);
