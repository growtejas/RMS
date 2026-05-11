-- Phase 8 — Standardized pagination rollout: covering indexes for canonical list
-- endpoints. All ORDER BY / WHERE keys used by paginated GET routes get a
-- backing index so LIMIT/OFFSET stays cheap as data grows.
--
-- All statements are `CREATE INDEX IF NOT EXISTS` and are safe to re-run.

-- CIE / global candidates list:
--   ORDER BY candidates.created_at DESC for the org-scoped roster.
CREATE INDEX IF NOT EXISTS "idx_candidates_org_createdat"
  ON "candidates" ("organization_id", "created_at" DESC);

-- CIE search filter on full_name (ILIKE %q%); a btree index helps the planner
-- short-circuit when q is empty (only org filter) and supports trigram-based
-- text search if the operator class is later switched to gin_trgm_ops.
CREATE INDEX IF NOT EXISTS "idx_candidates_org_full_name"
  ON "candidates" ("organization_id", "full_name");

-- CIE search filter on email (ILIKE %q%).
CREATE INDEX IF NOT EXISTS "idx_candidates_org_email"
  ON "candidates" ("organization_id", "email");

-- Referrals list (`GET /api/referrals`): partial index keyed by org+createdAt.
CREATE INDEX IF NOT EXISTS "idx_candidates_org_referral_createdat"
  ON "candidates" ("organization_id", "created_at" DESC)
  WHERE "is_referral" = true;

-- Notification events listing (`GET /api/notifications/events`):
--   ORDER BY created_at DESC scoped to org.
CREATE INDEX IF NOT EXISTS "idx_notification_events_org_createdat"
  ON "notification_events" ("organization_id", "created_at" DESC);

-- Bulk import jobs listing (`GET /api/bulk-import`):
--   ORDER BY created_at DESC scoped to org.
CREATE INDEX IF NOT EXISTS "idx_bulk_import_jobs_org_createdat"
  ON "bulk_import_jobs" ("organization_id", "created_at" DESC);

-- Workflow transition audit (`GET /api/workflow/audit/[reqId]`):
--   The existing `idx_wta_entity_createdat` covers this query pattern;
--   no additional index needed here.
